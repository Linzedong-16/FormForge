/**
 * 审核模块 — Zod Schema 定义
 *
 * 所有请求体 / 查询参数统一通过 Zod 校验
 * 输出类型可供 Service 层直接复用
 */

import { z } from "zod";

// ─── 审核 ID 校验 ─────────────────────────────────────────────

/** 审核记录 ID — 仅允许纯数字字符串，自动转为 BigInt */
export const reviewIdSchema = z
  .string()
  .regex(/^\d+$/, "审核记录 ID 必须为数字")
  .transform(val => BigInt(val));

// ─── 审核列表查询参数 ─────────────────────────────────────────

/** GET /api/admin/reviews — 审核列表查询参数 */
export const reviewListQuerySchema = z.object({
  review_type: z.enum(["survey", "template"]).default("survey"),
  status: z.enum(["none", "pending", "approved", "rejected"]).default("pending"),
  survey_type: z.enum(["personal", "template"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10)
});

// ─── 审核通过（审核意见可选） ─────────────────────────────────

/** POST /api/admin/reviews/:id/approve — 审核通过 */
export const approveReviewSchema = z.object({
  review_comment: z.string().max(500, "审核意见最多 500 个字符").optional()
});

// ─── 审核驳回（审核意见必填） ─────────────────────────────────

/** POST /api/admin/reviews/:id/reject — 审核驳回 */
export const rejectReviewSchema = z.object({
  review_comment: z.string().min(1, "驳回时必须填写审核意见").max(500, "审核意见最多 500 个字符")
});

// ─── 类型导出（供 Service 层复用） ─────────────────────────────

export type ReviewListQueryInput = z.infer<typeof reviewListQuerySchema>;
export type ApproveReviewInput = z.infer<typeof approveReviewSchema>;
export type RejectReviewInput = z.infer<typeof rejectReviewSchema>;
