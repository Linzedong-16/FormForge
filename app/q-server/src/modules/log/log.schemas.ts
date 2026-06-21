/**
 * 日志查询模块 — Zod Schema 定义
 *
 * "定义一次 Schema，校验 + 类型推导 + 复用 三合一"
 */

import { z } from "zod";
import { paginationSchema } from "../../utils/pagination.js";

// ══════════════════════════════════════════════════════════════
//  日志查询参数 Schema
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/logs — 日志列表查询参数
 *
 * 支持时间范围、日志级别、服务来源、关键词搜索 及分页
 */
export const logListQuerySchema = paginationSchema.extend({
  /** 开始时间（ISO 8601 字符串） */
  startDate: z.string().datetime({ message: "开始时间格式不正确" }).optional(),
  /** 结束时间（ISO 8601 字符串） */
  endDate: z.string().datetime({ message: "结束时间格式不正确" }).optional(),
  /** 日志级别筛选 */
  level: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"], {
      message: "日志级别必须为 trace/debug/info/warn/error/fatal"
    })
    .optional(),
  /** 服务来源筛选 */
  source: z.string().max(50, "服务来源最多50个字符").optional(),
  /** 关键词搜索（匹配 message 字段） */
  keyword: z.string().max(200, "关键词最多200个字符").optional()
});

/**
 * GET /api/logs/stats — 日志统计查询参数
 *
 * 支持按时间范围筛选统计
 */
export const logStatsQuerySchema = z.object({
  /** 开始时间（ISO 8601 字符串） */
  startDate: z.string().datetime({ message: "开始时间格式不正确" }).optional(),
  /** 结束时间（ISO 8601 字符串） */
  endDate: z.string().datetime({ message: "结束时间格式不正确" }).optional()
});

// ══════════════════════════════════════════════════════════════
//  类型导出（从 Schema 自动推导）
// ══════════════════════════════════════════════════════════════

export type LogListQueryInput = z.infer<typeof logListQuerySchema>;
export type LogStatsQueryInput = z.infer<typeof logStatsQuerySchema>;

// ══════════════════════════════════════════════════════════════
//  审计日志查询参数 Schema
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/audit-logs — 审计日志列表查询参数
 *
 * 支持时间范围、操作类型、资源类型、操作者、关键词搜索 及分页
 */
export const auditLogListQuerySchema = paginationSchema.extend({
  /** 开始时间（ISO 8601 字符串） */
  startDate: z.string().datetime({ message: "开始时间格式不正确" }).optional(),
  /** 结束时间（ISO 8601 字符串） */
  endDate: z.string().datetime({ message: "结束时间格式不正确" }).optional(),
  /** 操作类型筛选 */
  action: z.string().max(50, "操作类型最多50个字符").optional(),
  /** 资源类型筛选 */
  resourceType: z.string().max(50, "资源类型最多50个字符").optional(),
  /** 操作者 ID 筛选 */
  userId: z.coerce.number().int().positive().optional(),
  /** 关键词搜索（匹配 details JSON 字段） */
  keyword: z.string().max(200, "关键词最多200个字符").optional()
});

/**
 * GET /api/audit-logs/stats — 审计日志统计查询参数
 */
export const auditLogStatsQuerySchema = z.object({
  /** 开始时间（ISO 8601 字符串） */
  startDate: z.string().datetime({ message: "开始时间格式不正确" }).optional(),
  /** 结束时间（ISO 8601 字符串） */
  endDate: z.string().datetime({ message: "结束时间格式不正确" }).optional()
});

export type AuditLogListQueryInput = z.infer<typeof auditLogListQuerySchema>;
export type AuditLogStatsQueryInput = z.infer<typeof auditLogStatsQuerySchema>;
