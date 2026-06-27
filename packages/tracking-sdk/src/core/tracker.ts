/**
 * 主追踪器（Tracker）
 *
 * SDK 的核心调度中心，负责：
 * - 统一入口：所有 track 调用汇入此类
 * - 上下文填充：自动补全公共字段
 * - 采样决策：客户端侧按优先级采样
 * - 路由分发：错误事件直达 transport，其他事件入队列缓冲
 * - 生命周期：管理页面卸载时的最终冲刷
 *
 * @module core/tracker
 */

import type { TrackingConfig, TrackingEvent, EventPriority, ResolvedConfig, BatchPayload } from "../types/index.js";
import { uuidv7, sanitizeObject, containsSurveyContent } from "../utils/index.js";
import { ContextBuilder } from "./context.js";
import { EventQueue } from "./queue.js";
import { sendBatch, sendBeacon } from "../transport/index.js";

/**
 * 配置默认值。
 */
const DEFAULTS = {
  enabled: true,
  debug: false,
  maxQueueSize: 200,
  batchSize: 50,
  flushInterval: 10_000,
  maxRetries: 3,
  retryBaseMs: 1000,
  sampleRate: 1
} as const;

/**
 * 问卷系统前端埋点追踪器。
 *
 * 使用方式：
 * ```ts
 * const tracker = new Tracker({ appId: 'q-editor', endpoint: '/api/v1/track' });
 * tracker.track('editor_create_survey', 'behavior', { source: 'scratch' });
 * ```
 *
 * @class Tracker
 */
export class Tracker {
  private config: ResolvedConfig;
  private context: ContextBuilder;
  private queue: EventQueue;
  private initialized: boolean;

  /**
   * 创建 Tracker 实例。
   *
   * @param config - SDK 配置
   */
  constructor(config: TrackingConfig) {
    this.config = this.resolveConfig(config);
    this.context = new ContextBuilder(this.config.appId, this.config.sampleRate);
    this.initialized = false;

    // 绑定队列冲刷回调
    this.queue = new EventQueue(
      async (events: TrackingEvent[]) => {
        await this.transmitBatch(events);
      },
      this.config.maxQueueSize,
      this.config.flushInterval
    );

    // 页面卸载时冲刷
    this.setupUnloadListener();
  }

  /**
   * 初始化追踪器。
   *
   * 调用后开始自动采集（全局错误监听、性能观察器、页面浏览等）。
   * 必须在应用启动后调用一次。
   *
   * @throws 如果重复调用
   */
  init(): void {
    if (this.initialized) {
      if (this.config.debug) {
        console.warn("[tracking-sdk] Tracker 已初始化，忽略重复调用");
      }
      return;
    }
    this.initialized = true;

    if (this.config.debug) {
      console.log(
        `[tracking-sdk] 初始化完成 → appId=${this.config.appId}, endpoint=${this.config.endpoint}, batchSize=${this.config.batchSize}`
      );
    }
  }

  /**
   * 核心埋点方法。
   *
   * 所有业务事件通过此方法上报。SDK 自动完成：
   * 1. 公共字段填充
   * 2. 属性脱敏
   * 3. 答卷内容检测
   * 4. 采样判断
   * 5. beforeSend 过滤
   * 6. 路由分发（错误 → 直接发送，其他 → 入队缓冲）
   *
   * @param eventName - 事件名（snake_case），如 'editor_create_survey'
   * @param priority - 事件优先级
   * @param properties - 事件自定义属性（可选），必须是 JSON 可序列化的对象
   *
   * @example
   * ```ts
   * // 行为事件
   * tracker.track('editor_create_survey', 'behavior', {
   *   source: 'scratch',
   *   component_count: 0
   * });
   *
   * // 错误事件（立即发送）
   * tracker.track('api_error', 'error', {
   *   api_path: '/api/surveys',
   *   http_status: 500
   * });
   *
   * // 性能事件
   * tracker.track('page_perf', 'perf', {
   *   fcp_ms: 320,
   *   lcp_ms: 1200
   * });
   * ```
   */
  track(eventName: string, priority: EventPriority, properties?: Record<string, unknown>): void {
    if (!this.config.enabled) return;

    // 采样判断
    if (!this.context.shouldSample(priority)) return;

    // 属性脱敏 + 答卷内容检测
    let safeProperties = properties ?? {};
    const sanitized = sanitizeObject(safeProperties);
    if (typeof sanitized === "object" && sanitized !== null) {
      safeProperties = sanitized as Record<string, unknown>;
    }

    // 答卷内容检测（核心安全防护）
    if (containsSurveyContent(safeProperties)) {
      if (this.config.debug) {
        console.warn("[tracking-sdk] 检测到疑似答卷内容，已丢弃事件:", eventName);
      }
      return;
    }

    // 构建完整事件
    const event = this.context.buildEvent(eventName, priority, safeProperties);
    event.event_id = uuidv7();

    // beforeSend 过滤
    if (this.config.beforeSend) {
      const filtered = this.config.beforeSend(event);
      if (!filtered) return;
      // 如果 beforeSend 返回了修改后的事件，使用修改后的版本
      Object.assign(event, filtered);
    }

    // 路由分发
    if (priority === "error") {
      // 错误事件直接发送，不入队
      this.transmitImmediate(event);
    } else {
      this.queue.enqueue(event);
    }
  }

  /**
   * 设置当前登录用户 ID。
   *
   * 登录成功后调用此方法，使后续事件关联到具体用户。
   * 注销时传入 null。
   *
   * @param userId - 用户 ID 或 null
   *
   * @example
   * ```ts
   * // 登录后
   * tracker.setUserId('42');
   *
   * // 注销时
   * tracker.setUserId(null);
   * ```
   */
  setUserId(userId: string | null): void {
    this.context.setUserId(userId);
  }

  /**
   * 设置用户自定义属性（预留，当前版本暂不独立发送）。
   *
   * @param _properties - 用户属性键值对
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setUserProperties(_properties: Record<string, unknown>): void {
    // 后续版本可在此实现 once() 语义的用户属性设置
    if (this.config.debug) {
      console.log("[tracking-sdk] setUserProperties 调用（预留功能）");
    }
  }

  /**
   * 手动冲刷缓冲队列。
   *
   * 通常在路由切换时或应用进入后台前调用。
   *
   * @returns Promise，冲刷完成后 resolve
   */
  async flush(): Promise<void> {
    await this.queue.flush();
  }

  /**
   * 获取队列当前长度（调试用）。
   */
  get queueSize(): number {
    return this.queue.size;
  }

  /**
   * 是否已初始化。
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  // ── 内部方法 ────────────────────────────────────────────────

  /**
   * 解析并合并用户配置与默认值。
   */
  private resolveConfig(input: TrackingConfig): ResolvedConfig {
    const batchEndpoint = input.batchEndpoint ?? `${input.endpoint}/batch`;
    return {
      appId: input.appId,
      endpoint: input.endpoint,
      batchEndpoint,
      enabled: input.enabled ?? DEFAULTS.enabled,
      debug: input.debug ?? DEFAULTS.debug,
      maxQueueSize: input.maxQueueSize ?? DEFAULTS.maxQueueSize,
      batchSize: input.batchSize ?? DEFAULTS.batchSize,
      flushInterval: input.flushInterval ?? DEFAULTS.flushInterval,
      maxRetries: input.maxRetries ?? DEFAULTS.maxRetries,
      retryBaseMs: input.retryBaseMs ?? DEFAULTS.retryBaseMs,
      sampleRate: input.sampleRate ?? DEFAULTS.sampleRate,
      headers: input.headers ?? {},
      beforeSend: input.beforeSend ?? null,
      userId: input.userId ?? null,
      deviceId: input.deviceId ?? ""
    };
  }

  /**
   * 立即发送单个事件（错误事件专用）。
   *
   * 使用 sendBeacon 或 fetch keepalive。
   */
  private transmitImmediate(event: TrackingEvent): void {
    const payload = JSON.stringify(event);

    try {
      const sent = sendBeacon(this.config.endpoint, payload);
      if (!sent) {
        // sendBeacon 失败（body 太大或浏览器不支持）→ 降级 fetch
        sendBatch(
          this.config.endpoint,
          { events: [event], sent_at: new Date().toISOString(), batch_id: uuidv7() },
          this.config.headers
        ).catch(() => {
          // 静默失败
        });
      }
    } catch {
      // 静默失败，埋点绝不能抛异常影响业务
    }
  }

  /**
   * 批量发送缓冲事件。
   */
  private async transmitBatch(events: TrackingEvent[]): Promise<void> {
    if (events.length === 0) return;

    const payload: BatchPayload = {
      events,
      sent_at: new Date().toISOString(),
      batch_id: uuidv7()
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await sendBatch(this.config.batchEndpoint, payload, this.config.headers);
        return; // 成功，退出
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.config.maxRetries) {
          // 指数退避
          const delay = this.config.retryBaseMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 所有重试均失败
    if (this.config.debug) {
      console.error("[tracking-sdk] 批量上报失败:", lastError?.message);
    }
    throw lastError;
  }

  /**
   * 注册页面卸载监听器。
   */
  private setupUnloadListener(): void {
    // visibilitychange: 页面隐藏时冲刷（切后台 / 关闭）
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        this.handlePageUnload();
      }
    };

    // beforeunload: 页面卸载前最后冲刷
    const onBeforeUnload = (): void => {
      this.handlePageUnload();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onBeforeUnload);
  }

  /**
   * 页面卸载时的处理：取出队列中所有事件，
   * 逐条通过 sendBeacon 发送。
   */
  private handlePageUnload(): void {
    const remaining = [...this.queue.events];
    if (remaining.length === 0) return;

    // 页面卸载时不走批量上报，改为逐条 sendBeacon
    for (const event of remaining) {
      const payload = JSON.stringify(event);
      sendBeacon(this.config.endpoint, payload);
    }
  }
}
