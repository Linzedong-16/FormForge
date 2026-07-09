/**
 * 数据分析接口 — Zod 校验 Schema
 *
 * 查询参数校验，对齐设计文档 §9.4 的 API 查询接口设计
 */

import { z } from "zod";
import { TRACKING_APP_IDS, TRACKING_ENVIRONMENTS } from "monorepo-code-common";

// ─── 公共校验类型 ────────────────────────────────────────────────

const timeRangeSchema = z.enum(["1h", "6h", "24h", "7d", "30d", "90d"]);
const granularitySchema = z.enum(["minute", "hour", "day", "week", "month"]);
const appIdSchema = z.enum(TRACKING_APP_IDS).optional();
/** 部署环境筛选：可选，默认 production，避免预发/开发数据污染生产看板 */
const environmentSchema = z.enum(TRACKING_ENVIRONMENTS).optional().default("production");

// ─── 趋势查询 ───────────────────────────────────────────────────

export const analyticsTrendQuerySchema = z.object({
  metric: z.enum(["pv", "uv", "errors", "api_requests", "surveys_created", "responses", "ai_usage"]),
  granularity: granularitySchema,
  range: timeRangeSchema,
  app_id: appIdSchema,
  environment: environmentSchema
});
export type AnalyticsTrendQueryInput = z.infer<typeof analyticsTrendQuerySchema>;

// ─── 错误查询 ───────────────────────────────────────────────────

export const analyticsErrorsQuerySchema = z.object({
  app_id: appIdSchema,
  environment: environmentSchema,
  range: timeRangeSchema,
  top_n: z.coerce.number().int().min(1).max(100).optional().default(10),
  error_type: z.string().max(64).optional()
});
export type AnalyticsErrorsQueryInput = z.infer<typeof analyticsErrorsQuerySchema>;

// ─── 性能查询 ───────────────────────────────────────────────────

export const analyticsPerformanceQuerySchema = z.object({
  app_id: appIdSchema,
  environment: environmentSchema,
  metric: z.enum(["fcp", "lcp", "cls", "inp", "api_duration"]),
  range: timeRangeSchema,
  page_url: z.string().max(2048).optional()
});
export type AnalyticsPerformanceQueryInput = z.infer<typeof analyticsPerformanceQuerySchema>;

// ─── 漏斗查询 ───────────────────────────────────────────────────

export const analyticsFunnelQuerySchema = z.object({
  funnel_name: z.enum(["survey_response", "survey_creation", "ai_usage"]),
  range: timeRangeSchema,
  app_id: appIdSchema
});
export type AnalyticsFunnelQueryInput = z.infer<typeof analyticsFunnelQuerySchema>;

// ─── AI 使用查询 ─────────────────────────────────────────────────

export const analyticsAIUsageQuerySchema = z.object({
  range: timeRangeSchema
});
export type AnalyticsAIUsageQueryInput = z.infer<typeof analyticsAIUsageQuerySchema>;

// ─── 事件详情查询 ────────────────────────────────────────────────

export const analyticsEventDetailQuerySchema = z.object({
  event_name: z.string().max(64).optional(),
  app_id: appIdSchema,
  user_id: z.coerce.number().int().optional(),
  range: timeRangeSchema,
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20)
});
export type AnalyticsEventDetailQueryInput = z.infer<typeof analyticsEventDetailQuerySchema>;

// ─── 概览查询（无参数） ──────────────────────────────────────────

export const analyticsOverviewQuerySchema = z.object({}).optional();
