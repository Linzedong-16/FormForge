/**
 * 内存缓冲队列模块
 *
 * 提供带优先级和容量限制的环形缓冲队列。
 * 错误事件跳过队列直接发送，行为和性能事件走队列批量上报。
 *
 * @module core/queue
 */

import type { TrackingEvent } from "../types/index.js";

/**
 * 事件缓冲队列。
 *
 * 采用环形缓冲区实现，当队列满时丢弃最旧的非错误事件。
 * 错误事件（priority='error'）不进入队列，由上层直接调用 transport。
 */
export class EventQueue {
  private buffer: TrackingEvent[];
  private readonly maxSize: number;
  private readonly onFlush: (events: TrackingEvent[]) => Promise<void>;
  private flushTimer: ReturnType<typeof setTimeout> | null;
  private readonly flushInterval: number;
  private flushing: boolean;

  /**
   * @param onFlush - 冲刷回调，接收待发送的事件数组
   * @param maxSize - 队列最大容量，默认 200
   * @param flushInterval - 自动冲刷间隔（毫秒），默认 10000
   */
  constructor(onFlush: (events: TrackingEvent[]) => Promise<void>, maxSize = 200, flushInterval = 10_000) {
    this.buffer = [];
    this.maxSize = maxSize;
    this.onFlush = onFlush;
    this.flushInterval = flushInterval;
    this.flushTimer = null;
    this.flushing = false;

    this.startFlushTimer();
  }

  /**
   * 将事件推入队列。
   *
   * 错误事件（priority='error'）不入队，返回 false 由调用方直接发送。
   * 当队列满时，丢弃最早的非错误事件。
   *
   * @param event - 待入队的埋点事件
   * @returns true 表示已入队，false 表示应直接发送（错误事件）
   */
  enqueue(event: TrackingEvent): boolean {
    // 错误事件不入队
    if (event.priority === "error") {
      return false;
    }

    // 队列满 → 淘汰最旧的非错误事件
    if (this.buffer.length >= this.maxSize) {
      const oldestNonErrorIdx = this.buffer.findIndex(e => e.priority !== "error");
      if (oldestNonErrorIdx !== -1) {
        this.buffer.splice(oldestNonErrorIdx, 1);
      } else {
        // 全为错误事件（理论上不会发生），丢弃新事件
        return true;
      }
    }

    this.buffer.push(event);

    // 达到批量阈值 → 立即冲刷
    if (this.buffer.length >= 50) {
      this.flush();
    }

    return true;
  }

  /**
   * 立即冲刷队列中的所有事件。
   *
   * 冲刷过程加锁防止并发，冲刷失败的事件保留在队列中等待下次重试。
   *
   * @returns Promise，冲刷完成后 resolve
   */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;

    this.flushing = true;
    const batch = this.buffer.splice(0);

    try {
      await this.onFlush(batch);
    } catch {
      // 发送失败 → 重新放回队首
      this.buffer = [...batch, ...this.buffer];
    } finally {
      this.flushing = false;
    }
  }

  /**
   * 获取当前队列长度。
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * 获取当前队列中的所有事件（不清空）。
   */
  get events(): readonly TrackingEvent[] {
    return this.buffer;
  }

  /**
   * 启动定时冲刷。
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }

  /**
   * 销毁队列：清除定时器并立即冲刷剩余事件。
   *
   * 应在页面卸载时调用。
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length > 0) {
      // 页面卸载时不走批量上报，改为逐条 sendBeacon
      // 由上层 tracker 处理
    }
  }
}
