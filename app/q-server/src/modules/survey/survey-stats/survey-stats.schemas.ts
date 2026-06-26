/**
 * 问卷统计模块 — Zod Schema 定义
 *
 * 所有查询参数统一通过 Zod 校验
 * 输出类型可供 Service 层直接复用
 */

import { z } from "zod";

// ══════════════════════════════════════════════════════════════════
//  统计概览
// ══════════════════════════════════════════════════════════════════

/** GET /api/admin/stats/overview — 查询参数（可选日期范围） */
export const statsOverviewQuerySchema = z.object({
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional()
});

// ══════════════════════════════════════════════════════════════════
//  单问卷统计
// ══════════════════════════════════════════════════════════════════

/** 问卷 ID 参数校验 */
export const statsSurveyIdSchema = z
  .string()
  .regex(/^\d+$/, "问卷 ID 必须为数字")
  .transform(val => BigInt(val));

// ══════════════════════════════════════════════════════════════════
//  答卷查询
// ══════════════════════════════════════════════════════════════════

/** GET /api/admin/surveys/:id/responses — 查询参数 */
export const adminResponseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  status: z.coerce.number().int().min(0).max(1).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  keyword: z.string().max(200).optional()
});

// ══════════════════════════════════════════════════════════════════
//  报表导出
// ══════════════════════════════════════════════════════════════════

/** GET /api/admin/surveys/:id/responses/export — 查询参数 */
export const exportQuerySchema = z.object({
  format: z.enum(["csv"]).default("csv"),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional()
});

// ══════════════════════════════════════════════════════════════════
//  导出类型（供 Service 层复用）
// ══════════════════════════════════════════════════════════════════

export type StatsOverviewQueryInput = z.infer<typeof statsOverviewQuerySchema>;
export type AdminResponseListQueryInput = z.infer<typeof adminResponseListQuerySchema>;
export type ExportQueryInput = z.infer<typeof exportQuerySchema>;
