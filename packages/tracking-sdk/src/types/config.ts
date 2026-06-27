/**
 * SDK 配置类型定义
 *
 * @module types/config
 */

/**
 * 埋点事件优先级。
 *
 * - `error`: 最高，实时上报，不缓冲
 * - `perf`: 中，缓冲批量上报
 * - `behavior`: 低，缓冲批量上报
 * - `metric`: 最低，随行为事件批量冲刷
 */
import type { TrackingEvent } from "./events.js";

export type EventPriority = "error" | "perf" | "behavior" | "metric";

/**
 * 传输方式。
 *
 * - `fetch`: 批量 POST 请求（默认）
 * - `beacon`: navigator.sendBeacon（页面卸载时）
 * - `image`: 图片 Beacon 降级（跨域兼容）
 */
export type TransportMethod = "fetch" | "beacon" | "image";

/**
 * SDK 初始化配置。
 */
export interface TrackingConfig {
  /** 应用标识，必填，用于区分不同子应用 */
  appId: string;

  /** 埋点上报端点地址，如 '/api/v1/track' */
  endpoint: string;

  /** 批量上报端点地址，如 '/api/v1/track/batch'，默认 `${endpoint}/batch` */
  batchEndpoint?: string;

  /** 是否启用埋点，默认 true。设为 false 则 SDK 仅加载不发送 */
  enabled?: boolean;

  /** 是否开启调试日志，默认 false */
  debug?: boolean;

  /** 内存缓冲队列最大长度，超过后旧事件被丢弃，默认 200 */
  maxQueueSize?: number;

  /** 批量发送阈值（条数），默认 50 */
  batchSize?: number;

  /** 冲刷间隔（毫秒），默认 10000 */
  flushInterval?: number;

  /** 最大重试次数，默认 3 */
  maxRetries?: number;

  /** 重试退避基数（毫秒），默认 1000 */
  retryBaseMs?: number;

  /** 行为事件采样率（0-1），默认 1（全量）。高频事件自动应用此采样率 */
  sampleRate?: number;

  /** 自定义请求头，如认证 Token */
  headers?: Record<string, string>;

  /** 上报前回调，可在此修改或过滤事件。返回 false 则丢弃该事件 */
  beforeSend?: (event: TrackingEvent) => TrackingEvent | false;

  /** 自定义设备 ID，未提供时自动生成并持久化 */
  deviceId?: string;

  /** 自定义用户 ID，登录后调用 setUserId 覆盖 */
  userId?: string;
}

/**
 * SDK 内部使用的完整配置（所有可选字段已填充默认值）。
 */
export interface ResolvedConfig
  extends Required<Omit<TrackingConfig, "headers" | "beforeSend" | "userId" | "deviceId">> {
  headers: Record<string, string>;
  beforeSend: ((event: TrackingEvent) => TrackingEvent | false) | null;
  userId: string | null;
  deviceId: string;
  batchEndpoint: string;
}
