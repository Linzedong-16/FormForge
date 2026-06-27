/**
 * 图片 Beacon 降级上报
 *
 * 当 fetch 和 sendBeacon 都不可用时（极端旧浏览器或受限环境），
 * 使用 1x1 透明图片的 GET 请求进行上报。
 *
 * 这是最后兜底方案，有以下限制：
 * - 只能 GET 请求
 * - URL 总长度限制约 2000 字符
 * - 无法发送大事件
 *
 * @module transport/fallback
 */

/**
 * 通过 Image Beacon 发送事件。
 *
 * 创建 1x1 Image 对象，将事件序列化为 base64 后放入 URL 参数。
 * 适用于事件属性极少、整体 URL 在 2000 字符以内的场景。
 *
 * @param endpoint - 上报端点 URL
 * @param data - 事件对象（必须极小）
 * @returns true 表示 Image 请求已发起
 *
 * @example
 * ```ts
 * // 仅作为最终降级方案
 * imageBeacon('/api/v1/track', {
 *   event_name: 'page_view',
 *   app_id: 'q-editor',
 *   timestamp: new Date().toISOString()
 * });
 * ```
 */
export function imageBeacon(endpoint: string, data: Record<string, string>): boolean {
  try {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      // 截断每个值以确保 URL 不超长
      params.append(key, value.slice(0, 100));
    }

    // 追加缓存破坏参数
    params.append("_t", Date.now().toString());

    const img = new Image(1, 1);
    img.src = `${endpoint}?${params.toString()}`;

    // 加载完成后清理（不关心成功或失败）
    img.onload = (): void => {
      (img as unknown as null) = null;
    };
    img.onerror = (): void => {
      (img as unknown as null) = null;
    };

    return true;
  } catch {
    return false;
  }
}
