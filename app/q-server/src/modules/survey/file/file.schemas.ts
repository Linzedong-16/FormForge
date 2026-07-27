/**
 * 问卷文件模块 — Zod 校验 Schema
 *
 * 因文件上传使用 multipart/form-data（由 @fastify/multipart 解析），
 * 此处主要校验路径参数和查询参数。
 */
import { z } from "zod";

// ─── 通用 ──────────────────────────────────────────────────────

/** 问卷 ID（BigInt 字符串校验，可选 — 支持草稿阶段未保存问卷的上传场景） */
export const surveyIdSchema = z
  .string()
  .regex(/^\d+$/, "问卷 ID 必须为数字")
  .transform(val => BigInt(val));

/** 问卷 ID（可选 — 允许空值，用于 PicItem 在草稿阶段的上传） */
export const optionalSurveyIdSchema = z
  .string()
  .regex(/^\d+$/, "问卷 ID 必须为数字")
  .transform(val => BigInt(val))
  .optional();

/** 文件 ID（BigInt 字符串校验） */
export const fileIdSchema = z
  .string()
  .regex(/^\d+$/, "文件 ID 必须为数字")
  .transform(val => BigInt(val));

// ─── 查询参数 ──────────────────────────────────────────────────

/** GET /surveys/:id/files 查询参数 */
export const fileListQuerySchema = z.object({
  file_type: z.enum(["survey_option_image", "survey_signature", "survey_cover"]).optional()
});

// ─── 导出类型 ──────────────────────────────────────────────────

export type FileListQuery = z.infer<typeof fileListQuerySchema>;
