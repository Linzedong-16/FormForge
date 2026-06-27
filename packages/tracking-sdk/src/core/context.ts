/**
 * 事件上下文自动采集模块
 *
 * 为每条埋点事件自动填充公共字段：
 * - 客户端环境（OS / 浏览器 / 设备 / 网络）
 * - 页面信息（URL / 标题 / 来源）
 * - 会话标识（session_id / device_id / anonymous_id）
 *
 * @module core/context
 */

import type { TrackingEvent, EventPriority } from "../types/index.js";
import { detectEnv, sanitizeUrl } from "../utils/index.js";
import { getSessionManager } from "./session.js";

/** SDK 版本 */
export const SDK_VERSION = "1.0.0";

/** 各优先级事件的默认采样率 */
const PRIORITY_SAMPLE_RATES: Record<EventPriority, number> = {
  error: 1, // 错误全量
  perf: 1, // 性能全量
  behavior: 0.1, // 行为 10%（click 等高频事件）
  metric: 1 // 业务指标全量
};

/**
 * 上下文构建器。
 *
 * 负责将 SDK 调用传入的 event_name、properties 与自动采集的
 * 公共字段合并为一条完整的 TrackingEvent。
 */
export class ContextBuilder {
  private appId: string;
  private userId: string | null;
  private sessionManager: ReturnType<typeof getSessionManager>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(appId: string, _sampleRate: number) {
    this.appId = appId;
    this.userId = null;
    this.sessionManager = getSessionManager();
  }

  /**
   * 更新当前登录用户 ID。
   *
   * @param id - 用户 ID 或 null（注销时）
   */
  setUserId(id: string | null): void {
    this.userId = id;
  }

  /**
   * 构建一条完整的事件对象。
   *
   * @param eventName - 事件名（snake_case）
   * @param priority - 事件优先级
   * @param properties - 事件自定义属性
   * @returns 完整的事件对象
   */
  buildEvent(eventName: string, priority: EventPriority, properties: Record<string, unknown> = {}): TrackingEvent {
    return {
      event_id: "", // 由 tracker 层填充
      event_name: eventName,
      app_id: this.appId,
      user_id: this.userId,
      anonymous_id: this.sessionManager.anonymousId,
      session_id: this.sessionManager.sessionId,
      device_id: this.sessionManager.deviceId,
      timestamp: new Date().toISOString(),
      client_env: detectEnv(),
      page_url: sanitizeUrl(window.location.href),
      page_title: document.title,
      referrer: document.referrer ? sanitizeUrl(document.referrer) : "",
      sdk_version: SDK_VERSION,
      priority,
      properties
    };
  }

  /**
   * 判断事件是否应被采样。
   *
   * 采样在客户端 SDK 层完成，不上报到服务端再丢弃，
   * 以最小化网络开销。
   *
   * @param priority - 事件优先级
   * @returns true 表示应上报
   */
  shouldSample(priority: EventPriority): boolean {
    const rate = PRIORITY_SAMPLE_RATES[priority];
    if (rate >= 1) return true;
    return Math.random() < rate;
  }
}
