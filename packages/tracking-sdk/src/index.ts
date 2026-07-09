/**
 * 问卷系统前端统一埋点监控 SDK
 *
 * 提供全面的 Web 应用可观测性能力：
 * - 事件追踪（埋点）
 * - 错误上报（JS 运行时、Promise、资源加载、Vue 组件）
 * - 性能采集（Web Vitals：FCP/LCP/TTI/CLS/INP）
 * - 用户行为（PV、点击、滚动深度）
 * - 批量/实时上报、离线缓冲、数据脱敏
 *
 * ## 快速开始
 *
 * ```ts
 * import { Tracker, ErrorCollector, PerformanceCollector } from 'monorepo-tracking-sdk';
 *
 * // 1. 创建追踪器
 * const tracker = new Tracker({
 *   appId: 'q-editor',
 *   endpoint: '/api/v1/track',
 *   debug: import.meta.env.DEV,
 * });
 *
 * // 2. 初始化
 * tracker.init();
 *
 * // 3. 安装采集器
 * const errorCollector = new ErrorCollector(tracker);
 * errorCollector.register();
 *
 * const perfCollector = new PerformanceCollector(tracker);
 * perfCollector.register();
 *
 * // 4. 手动埋点
 * tracker.track('editor_create_survey', 'behavior', {
 *   source: 'scratch'
 * });
 *
 * // 5. 登录后设置用户 ID
 * tracker.setUserId('42');
 * ```
 *
 * ## Vue 3 集成
 *
 * ```ts
 * import { createTrackingPlugin } from 'monorepo-tracking-sdk/plugins/vue';
 * app.use(createTrackingPlugin(tracker, { router }));
 * ```
 *
 * ## Axios 集成
 *
 * ```ts
 * import { installAxiosInterceptor } from 'monorepo-tracking-sdk/plugins/axios';
 * installAxiosInterceptor(axios, tracker);
 * ```
 *
 * @packageDocumentation
 * @module tracking-sdk
 */

// ── 核心 ──────────────────────────────────────────────────────
export { Tracker, ContextBuilder, EventQueue, getSessionManager, resetSessionManager } from "./core/index.js";

// ── 采集器 ────────────────────────────────────────────────────
export { ErrorCollector, PerformanceCollector, PageViewCollector, BehaviorCollector } from "./collectors/index.js";

// ── 传输层 ────────────────────────────────────────────────────
export { sendBatch, sendSingleWithKeepalive } from "./transport/fetch.js";
export { sendBeacon, sendBeaconBatch } from "./transport/beacon.js";
export { imageBeacon } from "./transport/fallback.js";

// ── 工具 ──────────────────────────────────────────────────────
export { uuidv7, sanitizeObject, sanitizeUrl, containsSurveyContent, detectEnv } from "./utils/index.js";

// ── 类型 ──────────────────────────────────────────────────────
export type {
  TrackingConfig,
  ResolvedConfig,
  EventPriority,
  TransportMethod,
  Environment,
  ClientEnv,
  BaseTrackingEvent,
  TrackingEvent,
  BatchPayload
} from "./types/index.js";

// ── 版本 ──────────────────────────────────────────────────────
export { SDK_VERSION } from "./core/context.js";
