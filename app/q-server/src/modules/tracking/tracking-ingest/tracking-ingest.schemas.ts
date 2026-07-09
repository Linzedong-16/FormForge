/**
 * 埋点上报接口 — Zod 校验 Schema
 *
 * 校验规则（对齐设计文档 §4.3）：
 *   • event_name 必填，长度 1-64
 *   • app_id 必填，必须在白名单内
 *   • environment 必填，必须为 production/staging/development 之一
 *   • timestamp 必填，不能超过未来 5 分钟
 *   • properties 大小 < 8KB
 *   • 单条 body < 10KB
 *   • 批量 body < 500KB（最多 200 条）
 */

import { z } from "zod";
import { TRACKING_APP_IDS, TRACKING_ENVIRONMENTS } from "monorepo-code-common";

// ─── 事件名称规范：1-64位 snake_case ────────────────────────────

const eventNameSchema = z
  .string()
  .min(1, "event_name 不能为空")
  .max(64, "event_name 最大 64 字符")
  .regex(/^[a-z][a-z0-9_]*$/, "event_name 必须为 snake_case 格式");

// ─── 时间戳校验：不能超过未来 5 分钟 ────────────────────────────

const timestampSchema = z.string().refine(
  val => {
    const ts = Date.parse(val);
    if (isNaN(ts)) return false;
    // 不能超过未来 5 分钟
    return ts <= Date.now() + 5 * 60 * 1000;
  },
  { message: "timestamp 无效或超过未来 5 分钟" }
);

// ─── 客户端环境 Schema ──────────────────────────────────────────

const clientEnvSchema = z
  .object({
    os: z.string().max(64).optional(),
    browser: z.string().max(64).optional(),
    browser_version: z.string().max(32).optional(),
    screen_width: z.number().int().min(0).max(10000).optional(),
    screen_height: z.number().int().min(0).max(10000).optional(),
    network_type: z.string().max(32).optional(),
    language: z.string().max(16).optional()
  })
  .optional();

// ─── properties 校验（JSON 大小限制 8KB）─────────────────────────

const propertiesSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .refine(
    val => {
      if (!val) return true;
      return JSON.stringify(val).length <= 8192;
    },
    { message: "properties 大小不能超过 8KB" }
  );

// ─── 单条事件 Schema ────────────────────────────────────────────

export const trackEventSchema = z.object({
  event_id: z.string().min(1).max(128),
  event_name: eventNameSchema,
  app_id: z.enum(TRACKING_APP_IDS),
  // 部署环境标识：必填，全链路追踪生产/预发/开发数据来源
  environment: z.enum(TRACKING_ENVIRONMENTS),
  user_id: z.number().int().nullable().optional(),
  anonymous_id: z.string().max(128).optional(),
  session_id: z.string().max(128).optional(),
  device_id: z.string().max(128).optional(),
  timestamp: timestampSchema,
  client_env: clientEnvSchema,
  page_url: z.string().max(2048).optional(),
  page_title: z.string().max(256).optional(),
  sdk_version: z.string().max(32).optional(),
  properties: propertiesSchema
});

/** 单条上报请求 Schema */
export const trackSingleSchema = trackEventSchema;
export type TrackSingleInput = z.infer<typeof trackSingleSchema>;

/** 批量上报请求 Schema（最多 200 条） */
export const trackBatchSchema = z.object({
  events: z.array(trackEventSchema).min(1, "events 不能为空").max(200, "单次批量上报最多 200 条")
});
export type TrackBatchInput = z.infer<typeof trackBatchSchema>;
