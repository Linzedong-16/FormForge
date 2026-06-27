/**
 * sendBeacon 上报
 *
 * 使用 navigator.sendBeacon API 发送事件数据。
 * sendBeacon 的优势：
 * - 浏览器保证在页面卸载时也能发送
 * - 不阻塞页面关闭
 * - 不需要读取响应
 *
 * 限制：
 * - 只支持 POST
 * - body 最大 64KB（实际因浏览器而异）
 * - 不支持自定义 Content-Type（浏览器自动设置）
 *
 * @module transport/beacon
 */

/**
 * 通过 sendBeacon 发送事件数据。
 *
 * 因为 sendBeacon 不支持 application/json Content-Type，
 * 使用 Blob 封装以确保正确的 MIME 类型。
 *
 * @param endpoint - 上报端点 URL
 * @param payload - JSON 序列化后的事件字符串
 * @returns true 表示浏览器接受了发送请求，false 表示发送失败
 *
 * @example
 * ```ts
 * const sent = sendBeacon('/api/v1/track', JSON.stringify(event));
 * if (!sent) {
 *   // 降级为 fetch
 * }
 * ```
 */
export function sendBeacon(endpoint: string, payload: string): boolean {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    return false;
  }

  try {
    // 使用 Blob 设置 Content-Type 为 application/json
    const blob = new Blob([payload], { type: "application/json" });
    return navigator.sendBeacon(endpoint, blob);
  } catch {
    // body 过大或其他异常 → 降级
    return false;
  }
}

/**
 * 通过 sendBeacon 批量发送事件。
 *
 * 注意：如果 body 超过浏览器 sendBeacon 限制（通常 64KB），
 * 会自动拆分批次。
 *
 * @param endpoint - 批量上报端点 URL
 * @param payloadList - 事件 JSON 字符串数组
 * @returns 成功发送的事件数
 */
export function sendBeaconBatch(endpoint: string, payloadList: string[]): number {
  let sent = 0;
  for (const payload of payloadList) {
    if (sendBeacon(endpoint, payload)) {
      sent++;
    } else {
      break; // 一旦失败，剩余事件通过其他方式发送
    }
  }
  return sent;
}
