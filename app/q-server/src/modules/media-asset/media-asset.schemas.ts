/**
 * 物料（图片资源）管理模块 — Zod Schema 定义
 *
 * 所有请求体 / 查询参数统一通过 Zod 校验
 * 输出类型可供 Service 层直接复用
 */

import { z } from "zod";

// ─── 物料 ID 校验 ─────────────────────────────────────────────

/** 物料 ID — 仅允许纯数字字符串，自动转为 BigInt */
export const mediaAssetIdSchema = z
  .string()
  .regex(/^\d+$/, "物料 ID 必须为数字")
  .transform(val => BigInt(val));

// ─── 列表查询参数 ─────────────────────────────────────────────

/** GET /api/admin/media-assets — 列表查询参数 */
export const mediaAssetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  user_id: z.string().regex(/^\d+$/, "user_id 必须为数字").optional(),
  survey_id: z.string().regex(/^\d+$/, "survey_id 必须为数字").optional(),
  review_status: z.enum(["pending", "approved", "rejected"]).optional(),
  file_type: z.enum(["survey_option_image", "survey_signature", "survey_cover", "user_avatar"]).optional(),
  resource_type: z.string().optional(),
  keyword: z.string().max(255).optional()
});

// ─── 更新元信息（禁止替换文件本体） ───────────────────────────

/** PUT /api/admin/media-assets/:id — 更新元信息请求体 */
export const updateMediaAssetSchema = z
  .object({
    resource_type: z.string().min(1).max(50).optional(),
    survey_id: z.string().regex(/^\d+$/, "survey_id 必须为数字").nullable().optional()
  })
  // 不允许更新文件本体（file_url/file_key）等未声明字段——严格模式下多余字段会被拒绝，
  // 替换文件请通过删除+重新上传完成
  .strict();

// ─── 批量删除 ─────────────────────────────────────────────────

/** POST /api/admin/media-assets/batch-delete — 请求体 */
export const batchDeleteMediaAssetsSchema = z.object({
  ids: z
    .array(z.string().regex(/^\d+$/, "物料 ID 必须为数字"))
    .min(1, "至少选择一条物料")
    .max(200, "单次批量操作不超过 200 条")
});

// ─── 审核状态变更 ─────────────────────────────────────────────

/** PUT /api/admin/media-assets/:id/review-status — 请求体 */
export const changeReviewStatusSchema = z.object({
  review_status: z.enum(["pending", "approved", "rejected"]),
  review_comment: z.string().max(500, "审核意见最多 500 个字符").optional()
});

// ─── 类型导出（供 Service 层复用） ─────────────────────────────

export type MediaAssetListQueryInput = z.infer<typeof mediaAssetListQuerySchema>;
export type UpdateMediaAssetInput = z.infer<typeof updateMediaAssetSchema>;
export type BatchDeleteMediaAssetsInput = z.infer<typeof batchDeleteMediaAssetsSchema>;
export type ChangeReviewStatusInput = z.infer<typeof changeReviewStatusSchema>;
