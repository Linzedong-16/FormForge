/**
 * Fetch 批量上报
 *
 * 将事件数组通过 JSON POST 发送到服务端批量接口。
 * 支持自定义请求头和超时控制。
 *
 * @module transport/fetch
 */

import type { BatchPayload } from "../types/index.js";

/** 默认请求超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * 通过 fetch 批量上报事件。
 *
 * 请求以 fire-and-forget 模式发送，不关注响应内容。
 * 服务端应返回 204 No Content。
 *
 * @param endpoint - 批量上报端点 URL
 * @param payload - 批次数据
 * @param headers - 自定义请求头（如认证 Token）
 * @param timeoutMs - 超时时间（毫秒），默认 5000
 * @returns Promise，成功时 resolve，失败时 reject
 * @throws {Error} 网络错误、超时或 HTTP 状态码 >= 400
 *
 * @example
 * ```ts
 * await sendBatch('/api/v1/track/batch', {
 *   events: [...],
 *   sent_at: new Date().toISOString(),
 *   batch_id: '019a6f80-...'
 * });
 * ```
 */
export async function sendBatch(
  endpoint: string,
  payload: BatchPayload,
  headers: Record<string, string> = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = JSON.stringify(payload);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body,
      signal: controller.signal,
      keepalive: true
    });

    if (!resp.ok && resp.status >= 400) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 通过 fetch 发送单条事件（带 keepalive）。
 *
 * 用于错误事件的即时上报，即使页面正在卸载也能发送。
 *
 * @param endpoint - 上报端点 URL
 * @param payload - 序列化后的事件 JSON 字符串
 * @param headers - 自定义请求头
 * @returns Promise，但调用方不应 await（fire-and-forget）
 */
export async function sendSingleWithKeepalive(
  endpoint: string,
  payload: string,
  headers: Record<string, string> = {}
): Promise<void> {
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: payload,
      keepalive: true
    });
  } catch {
    // 静默失败
  }
}
