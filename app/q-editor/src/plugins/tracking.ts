/**
 * 埋点监控接入 — 创建并配置 Tracker 实例
 *
 * 通过 monorepo-tracking-sdk 接入后端监控接口（对接 q-server 的
 * /api/v1/track、/api/v1/track/batch），采集：
 *   - JS 运行时错误 / Promise 未捕获异常 / 资源加载错误（window 级）
 *   - Vue 组件错误（app.config.errorHandler）
 *   - 编辑器自定义性能计时（加载/保存，见 EditorView）
 *   - 页面浏览 PV/UV（PageViewCollector，随路由变化自动上报）
 *
 * standalone 运行与 qiankun 子应用运行两种场景必须调用同一套接入逻辑，
 * 保证埋点行为一致（对齐 FR-004）。
 */
import { Tracker, ErrorCollector, PerformanceCollector, type Environment } from "monorepo-tracking-sdk";
import { createTrackingPlugin } from "monorepo-tracking-sdk/plugins/vue";
import type { App } from "vue";
import type { Router } from "vue-router";

/**
 * 将 Vite 的构建模式（import.meta.env.MODE）映射为埋点 SDK 的部署环境标签。
 *
 * - `production`（`vite build` 默认）→ production
 * - `staging`（预留：未来 `vite build --mode staging`）→ staging
 * - 其余（dev / mock 等）→ development（安全兜底，绝不将未知构建误标为生产）
 */
function resolveEnvironment(): Environment {
  const mode = import.meta.env.MODE;
  if (mode === "production") return "production";
  if (mode === "staging") return "staging";
  return "development";
}

/** 全局单例：standalone 与 qiankun 场景共用同一个 Tracker 实例 */
let trackerInstance: Tracker | null = null;
let errorCollectorInstance: ErrorCollector | null = null;
let perfCollectorInstance: PerformanceCollector | null = null;

/** 获取（懒创建）Tracker 单例 */
export function getTracker(): Tracker {
  if (!trackerInstance) {
    trackerInstance = new Tracker({
      appId: "q-editor",
      environment: resolveEnvironment(),
      endpoint: "/api/v1/track",
      debug: import.meta.env.DEV
    });
  }
  return trackerInstance;
}

/**
 * 获取（懒创建）window 级错误采集器。
 *
 * 供业务代码在 try/catch 中手动上报可恢复错误，例如：
 * ```ts
 * try {
 *   await saveSurvey(data);
 * } catch (err) {
 *   getErrorCollector().reportError(err as Error, { action: "save_survey" });
 * }
 * ```
 */
export function getErrorCollector(): ErrorCollector {
  if (!errorCollectorInstance) {
    errorCollectorInstance = new ErrorCollector(getTracker());
    errorCollectorInstance.register();
  }
  return errorCollectorInstance;
}

/**
 * 获取（懒创建）性能采集器。
 *
 * 供业务代码（如问卷加载/保存流程）调用 `trackTiming()` 上报自定义耗时，
 * 同时已注册 Web Vitals / 慢资源 / 长任务的自动采集。
 */
export function getPerformanceCollector(): PerformanceCollector {
  if (!perfCollectorInstance) {
    perfCollectorInstance = new PerformanceCollector(getTracker());
    perfCollectorInstance.register();
  }
  return perfCollectorInstance;
}

/**
 * 安装埋点监控能力：
 * 1. 注册 window 级错误采集（JS 运行时错误 / Promise 未捕获异常 / 资源加载错误）
 * 2. 安装 Vue Tracking Plugin（Vue 组件错误 + 按路由自动上报 PV，注入 $tracker）
 * 3. 启用自定义性能采集器
 *
 * standalone 场景在 `main.ts` 独立运行分支中调用；
 * qiankun 场景在 `mount()` 生命周期钩子中调用。
 *
 * @param app - Vue 应用实例
 * @param router - 当前子应用的 Router 实例（用于自动 PV 上报）
 */
export function installTracking(app: App, router: Router): void {
  const tracker = getTracker();
  getErrorCollector();

  app.use(createTrackingPlugin(tracker, { router }));
  getPerformanceCollector();
}

/**
 * 页面/子应用卸载前尽力冲刷缓冲区中的埋点事件。
 *
 * qiankun `unmount()` 生命周期钩子中调用，避免子应用被卸载后
 * 缓冲队列中的性能/行为事件丢失。
 */
export async function flushTracking(): Promise<void> {
  if (trackerInstance) {
    await trackerInstance.flush();
  }
}

/**
 * 重置内部单例状态（仅供单元测试使用）。
 */
export function resetTrackingForTest(): void {
  trackerInstance = null;
  errorCollectorInstance = null;
  perfCollectorInstance = null;
}
