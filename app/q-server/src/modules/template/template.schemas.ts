/**
 * 模板模块 — Zod Schema 定义
 *
 * 所有请求体 / 查询参数统一通过 Zod 校验
 * 输出类型可供 Service 层直接复用
 */

import { z } from "zod";

// ══════════════════════════════════════════════════════════════════
//  基础校验规则
// ══════════════════════════════════════════════════════════════════

/** 模板分类枚举 */
const categorySchema = z.enum(["education", "market", "hr", "customer", "event", "other"], {
  message: "分类必须为 education / market / hr / customer / event / other 之一"
});

/** 排序方式 */
const sortSchema = z
  .enum(["newest", "popular", "rating"], {
    message: "排序方式必须为 newest / popular / rating 之一"
  })
  .default("newest");

// ══════════════════════════════════════════════════════════════════
//  API Schema
// ══════════════════════════════════════════════════════════════════

/** GET /api/templates — 模板列表查询参数 */
export const templateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
  category: categorySchema.optional(),
  keyword: z.string().max(200).optional(),
  sort: sortSchema
});

/** POST /api/templates/:id/apply — 使用模板创建问卷 */
export const useTemplateSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(500, "标题最多500个字符").optional()
});

/** POST /api/templates/:id/rate — 模板评分 */
export const rateTemplateSchema = z.object({
  score: z.number().int().min(1, "评分最小为 1").max(5, "评分最大为 5")
});

/** 模板 ID 参数校验 */
export const templateIdSchema = z
  .string()
  .regex(/^\d+$/, "模板 ID 必须为数字")
  .transform(val => BigInt(val));

// ══════════════════════════════════════════════════════════════════
//  导出类型（供 Service 层复用）
// ══════════════════════════════════════════════════════════════════

export type TemplateListQueryInput = z.infer<typeof templateListQuerySchema>;
export type UseTemplateInput = z.infer<typeof useTemplateSchema>;
export type RateTemplateInput = z.infer<typeof rateTemplateSchema>;
