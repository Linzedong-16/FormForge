/**
 * Tracker 单元测试 — 本包首个测试文件
 *
 * 重点覆盖本次新增的 environment（部署环境）打点能力，
 * 顺带验证现有的答卷内容防护未被破坏。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Tracker } from "../core/tracker.js";
import { resetSessionManager } from "../core/session.js";
import type { TrackingEvent } from "../types/index.js";

describe("Tracker — environment 打点", () => {
  beforeEach(() => {
    resetSessionManager();
  });

  afterEach(() => {
    resetSessionManager();
  });

  it("显式配置的 environment 会被写入每一条事件", () => {
    const captured: TrackingEvent[] = [];

    const tracker = new Tracker({
      appId: "q-editor",
      environment: "staging",
      endpoint: "/api/v1/track",
      beforeSend: event => {
        captured.push(event);
        return event;
      }
    });
    tracker.init();

    tracker.track("editor_perf", "perf", { duration_ms: 120 });

    expect(captured).toHaveLength(1);
    expect(captured[0].environment).toBe("staging");
    expect(captured[0].app_id).toBe("q-editor");
  });

  it("未显式配置 environment 时安全默认为 development（不会被误标为生产）", () => {
    const captured: TrackingEvent[] = [];

    const tracker = new Tracker({
      appId: "q-editor",
      endpoint: "/api/v1/track",
      beforeSend: event => {
        captured.push(event);
        return event;
      }
    });
    tracker.init();

    // 使用 'metric' 优先级（采样率 100%），避免 'behavior' 默认 10% 采样导致测试不确定
    tracker.track("editor_load", "metric", {});

    expect(captured).toHaveLength(1);
    expect(captured[0].environment).toBe("development");
  });

  it("error 优先级事件（立即发送通道）同样携带 environment", () => {
    const captured: TrackingEvent[] = [];

    // happy-dom 测试环境不支持 navigator.sendBeacon，直接挂载一个 stub 避免降级走真实网络请求
    const sendBeaconStub = vi.fn().mockReturnValue(true);
    (navigator as unknown as { sendBeacon: typeof sendBeaconStub }).sendBeacon = sendBeaconStub;

    const tracker = new Tracker({
      appId: "q-editor",
      environment: "production",
      endpoint: "/api/v1/track",
      beforeSend: event => {
        captured.push(event);
        return event;
      }
    });
    tracker.init();

    tracker.track("js_error", "error", { error_message: "boom" });

    expect(captured).toHaveLength(1);
    expect(captured[0].environment).toBe("production");
    expect(captured[0].priority).toBe("error");
    expect(sendBeaconStub).toHaveBeenCalledTimes(1);

    delete (navigator as unknown as { sendBeacon?: unknown }).sendBeacon;
  });

  it("答卷内容检测（containsSurveyContent）在新增字段后仍然生效", () => {
    const captured: TrackingEvent[] = [];

    const tracker = new Tracker({
      appId: "q-editor",
      environment: "production",
      endpoint: "/api/v1/track",
      beforeSend: event => {
        captured.push(event);
        return event;
      }
    });
    tracker.init();

    // "answer" 字段命中疑似答卷内容检测，事件应被丢弃，不会进入 beforeSend
    tracker.track("editor_save", "perf", { answer: "用户填写的真实答案" });

    expect(captured).toHaveLength(0);
  });
});
