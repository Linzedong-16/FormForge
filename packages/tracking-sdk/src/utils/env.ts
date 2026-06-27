/**
 * 客户端环境自动检测工具
 *
 * @module utils/env
 */

import type { ClientEnv } from "../types/events.js";

/**
 * 自动检测并返回当前客户端环境信息。
 *
 * 包括操作系统、浏览器、设备类型、屏幕尺寸、网络类型、
 * 语言偏好和时区。
 *
 * @returns 客户端环境对象
 *
 * @example
 * ```ts
 * const env = detectEnv();
 * // => { os: 'Windows', browser: 'Chrome', deviceType: 'desktop', ... }
 * ```
 */
export function detectEnv(): ClientEnv {
  const ua = navigator.userAgent;
  return {
    os: detectOS(ua),
    browser: detectBrowser(ua),
    browserVersion: detectBrowserVersion(ua),
    deviceType: detectDeviceType(ua),
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    networkType: detectNetworkType(),
    language: navigator.language || "unknown",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown"
  };
}

/**
 * 检测操作系统。
 *
 * @param ua - navigator.userAgent
 * @returns 操作系统名称
 */
function detectOS(ua: string): string {
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os x/i.test(ua) || /macintosh/i.test(ua)) return "macOS";
  if (/linux/i.test(ua) && !/android/i.test(ua)) return "Linux";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/crkey/i.test(ua)) return "ChromeOS";
  return "unknown";
}

/**
 * 检测浏览器名称。
 *
 * @param ua - navigator.userAgent
 * @returns 浏览器名称
 */
function detectBrowser(ua: string): string {
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/opera|opr/i.test(ua)) return "Opera";
  if (/msie|trident/i.test(ua)) return "IE";
  return "unknown";
}

/**
 * 检测浏览器主版本号。
 *
 * @param ua - navigator.userAgent
 * @returns 版本号字符串
 */
function detectBrowserVersion(ua: string): string {
  const match = ua.match(/(?:chrome|firefox|safari|edge|opera|msie|trident)[/\s]?(\d+(?:\.\d+)*)/i);
  return match?.[1] ?? "unknown";
}

/**
 * 检测设备类型。
 *
 * @param ua - navigator.userAgent
 * @returns desktop / mobile / tablet
 */
function detectDeviceType(ua: string): "desktop" | "mobile" | "tablet" {
  if (/ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    return "tablet";
  }
  if (/mobi|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

/**
 * 检测网络连接类型。
 *
 * 使用 Network Information API，不支持时回退为 'unknown'。
 *
 * @returns 网络类型字符串
 */
function detectNetworkType(): string {
  const conn = (
    navigator as Navigator & {
      connection?: { effectiveType?: string };
    }
  ).connection;

  if (conn?.effectiveType) {
    return conn.effectiveType;
  }
  return "unknown";
}
