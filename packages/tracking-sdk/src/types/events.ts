/**
 * 埋点事件数据模型
 *
 * @module types/events
 */

/**
 * 客户端环境信息，由 SDK 自动采集。
 */
export interface ClientEnv {
  /** 操作系统，如 'Windows', 'macOS', 'Android', 'iOS' */
  os: string;
  /** 浏览器名称，如 'Chrome', 'Firefox', 'Safari', 'Edge' */
  browser: string;
  /** 浏览器版本号 */
  browserVersion: string;
  /** 设备类型 */
  deviceType: "desktop" | "mobile" | "tablet";
  /** 屏幕宽度（像素） */
  screenWidth: number;
  /** 屏幕高度（像素） */
  screenHeight: number;
  /** 网络类型，如 '4g', '5g', 'wifi', 'ethernet' */
  networkType: string;
  /** 语言偏好 */
  language: string;
  /** 时区 */
  timezone: string;
}

/**
 * 埋点事件基类，所有上报事件必须包含的公共字段。
 */
export interface BaseTrackingEvent {
  /** 事件唯一 ID（UUID v7） */
  event_id: string;
  /** 事件名称，snake_case */
  event_name: string;
  /** 应用标识 */
  app_id: string;
  /** 登录用户 ID（未登录为 null） */
  user_id: string | null;
  /** 匿名用户 ID（localStorage 持久化） */
  anonymous_id: string;
  /** 会话 ID（sessionStorage 持久化） */
  session_id: string;
  /** 设备 ID（localStorage 持久化） */
  device_id: string;
  /** 客户端时间戳（ISO 8601，毫秒精度） */
  timestamp: string;
  /** 客户端环境信息 */
  client_env: ClientEnv;
  /** 当前页面完整 URL */
  page_url: string;
  /** 页面标题 */
  page_title: string;
  /** 来源页面 URL */
  referrer: string;
  /** SDK 版本号 */
  sdk_version: string;
}

/**
 * 完整的埋点事件（包含自定义属性）。
 */
export interface TrackingEvent extends BaseTrackingEvent {
  /** 事件优先级 */
  priority: EventPriority;
  /** 事件自定义属性，JSON 可序列化 */
  properties: Record<string, unknown>;
}

/**
 * 批量上报的请求体结构。
 */
export interface BatchPayload {
  /** 事件数组 */
  events: TrackingEvent[];
  /** 发送时的时间戳 */
  sent_at: string;
  /** 批次 UUID */
  batch_id: string;
}

import type { EventPriority } from "./config.js";
