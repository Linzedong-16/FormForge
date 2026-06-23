/**
 * 问卷模块 — Zod Schema 定义
 *
 * 所有请求体 / 查询参数统一通过 Zod 校验
 * 输出类型可供 Service 层直接复用
 */

import { z } from "zod";

// ══════════════════════════════════════════════════════════════════
//  基础校验规则
// ══════════════════════════════════════════════════════════════════

/** 问卷标题 — 1~500 字符 */
const titleSchema = z.string().min(1, "问卷标题不能为空").max(500, "问卷标题最多500个字符");

/** 问卷描述 — 可选，最多 2000 字符 */
const descriptionSchema = z.string().max(2000, "问卷描述最多2000个字符").optional();

/** 每页题目数 — 1~50 */
const pageSizeSchema = z.number().int().min(1).max(50).optional();

/** 是否公开 */
const isPublicSchema = z.union([z.literal(0), z.literal(1)]).optional();

/** 访问密码 — 可选，最多 50 字符 */
const accessCodeSchema = z.string().max(50, "访问密码最多50个字符").optional();

/** 组件配置 — 任意 JSON 对象 */
const componentConfigSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

/** 组件载荷 */
const componentPayloadSchema = z.object({
  type: z.string().min(1, "组件类型不能为空"),
  config: componentConfigSchema,
  order_index: z.number().int().min(0),
  required: z.union([z.literal(0), z.literal(1)])
});

/** 模板分类枚举 */
const categorySchema = z.enum(["education", "market", "hr", "customer", "event", "other"], {
  message: "分类必须为 education / market / hr / customer / event / other 之一"
});

/** 提交说明 — 可选，最多 500 字符，不允许空字符串 */
const submitMessageSchema = z
  .string()
  .max(500, "提交说明最多500个字符")
  .optional()
  .transform(val => (val === "" ? undefined : val));

// ══════════════════════════════════════════════════════════════════
//  API Schema
// ══════════════════════════════════════════════════════════════════

/** POST /api/surveys — 创建问卷 */
export const createSurveySchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  page_size: pageSizeSchema,
  is_public: isPublicSchema,
  status: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  access_code: accessCodeSchema,
  components: z.array(componentPayloadSchema).min(0)
});

/** PUT /api/surveys/:id — 更新问卷 */
export const updateSurveySchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema,
  status: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  page_size: pageSizeSchema,
  is_public: isPublicSchema,
  access_code: accessCodeSchema,
  components: z.array(componentPayloadSchema).optional()
});

/** GET /api/surveys — 问卷列表查询参数 */
export const surveyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
  status: z.coerce.number().int().min(0).max(2).optional(),
  keyword: z.string().max(200).optional()
});

/** POST /api/surveys/:id/publish — 发布问卷 */
export const publishSurveySchema = z.object({});

/** POST /api/surveys/:id/close — 关闭问卷 */
export const closeSurveySchema = z.object({});

/** POST /api/surveys/:id/apply-template — 申请共享模板 */
export const applyTemplateSchema = z.object({
  components: z.array(componentPayloadSchema).optional(),
  submit_message: submitMessageSchema,
  category: categorySchema
});

/** POST /api/surveys/:id/submit-review — 提交问卷审核 */
export const submitReviewSchema = z.object({
  components: z.array(componentPayloadSchema).optional(),
  submit_message: submitMessageSchema
});

/** 问卷 ID 参数校验 — 仅允许纯数字字符串，直接转为 BigInt */
export const surveyIdSchema = z
  .string()
  .regex(/^\d+$/, "问卷 ID 必须为数字")
  .transform(val => BigInt(val));

// ══════════════════════════════════════════════════════════════════
//  导出类型（供 Service 层复用）
// ══════════════════════════════════════════════════════════════════

export type CreateSurveyInput = z.infer<typeof createSurveySchema>;
export type UpdateSurveyInput = z.infer<typeof updateSurveySchema>;
export type SurveyListQueryInput = z.infer<typeof surveyListQuerySchema>;
export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>;
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
