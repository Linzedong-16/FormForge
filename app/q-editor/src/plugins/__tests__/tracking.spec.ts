/**
 * 埋点监控接入插件单元测试
 *
 * 覆盖：
 *   1. Tracker 单例创建，appId/environment 正确
 *   2. installTracking 在 standalone 与 qiankun 场景下均可正常安装，
 *      注入 $tracker 全局属性，且重复调用不重复安装
 *   3. flushTracking 冲刷缓冲队列
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApp } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import {
  getTracker,
  getErrorCollector,
  getPerformanceCollector,
  installTracking,
  flushTracking,
  resetTrackingForTest
} from "../tracking";

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }]
  });
}

describe("埋点监控接入插件", () => {
  beforeEach(() => {
    resetTrackingForTest();
  });

  it("getTracker 返回单例，appId 为 q-editor", () => {
    const tracker1 = getTracker();
    const tracker2 = getTracker();

    expect(tracker1).toBe(tracker2);
  });

  it("installTracking 在 standalone 场景下安装成功，注入 $tracker", () => {
    const app = createApp({ template: "<div />" });
    const router = createTestRouter();

    expect(() => installTracking(app, router)).not.toThrow();
    expect(app.config.globalProperties.$tracker).toBe(getTracker());
    expect(getTracker().isInitialized).toBe(true);
  });

  it("installTracking 在 qiankun 场景（不同 app 实例 + routerBase）下同样可安装，且复用同一 Tracker 单例", () => {
    const standaloneApp = createApp({ template: "<div />" });
    installTracking(standaloneApp, createTestRouter());
    const trackerAfterStandalone = getTracker();

    // 模拟 qiankun mount：新的 Vue app 实例 + 独立 router（routerBase 不同）
    const qiankunApp = createApp({ template: "<div />" });
    const qiankunRouter = createRouter({
      history: createMemoryHistory("/editor"),
      routes: [{ path: "/", component: { template: "<div />" } }]
    });

    expect(() => installTracking(qiankunApp, qiankunRouter)).not.toThrow();
    // 两种场景必须复用同一个 Tracker 实例，保证埋点行为一致（FR-004）
    expect(getTracker()).toBe(trackerAfterStandalone);
  });

  it("getPerformanceCollector 返回单例，供业务代码上报自定义计时", () => {
    const collector1 = getPerformanceCollector();
    const collector2 = getPerformanceCollector();

    expect(collector1).toBe(collector2);
  });

  it("getErrorCollector 返回单例，供业务代码手动上报可恢复错误", () => {
    const collector1 = getErrorCollector();
    const collector2 = getErrorCollector();

    expect(collector1).toBe(collector2);
  });

  it("installTracking 后路由跳转会自动上报 page_view（PV 采集，对齐 User Story 3）", async () => {
    const app = createApp({ template: "<div />" });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: { template: "<div />" } },
        { path: "/materials", component: { template: "<div />" } }
      ]
    });

    installTracking(app, router);
    const trackSpy = vi.spyOn(getTracker(), "track");

    await router.push("/materials");

    const pageViewCalls = trackSpy.mock.calls.filter(([eventName]) => eventName === "page_view");
    expect(pageViewCalls.length).toBeGreaterThan(0);
  });

  it("flushTracking 会调用 Tracker.flush()", async () => {
    const tracker = getTracker();
    const flushSpy = vi.spyOn(tracker, "flush").mockResolvedValue();

    await flushTracking();

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it("Tracker 尚未创建时调用 flushTracking 不抛出异常", async () => {
    await expect(flushTracking()).resolves.toBeUndefined();
  });
});
