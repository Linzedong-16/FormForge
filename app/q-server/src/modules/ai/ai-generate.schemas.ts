/**
 * AI 问卷生成 — Zod 校验 Schema
 *
 * 包含：
 *   - generateSurveySchema：请求体校验
 *   - aiComponentSchema：AI 输出组件校验
 *   - aiResponseSchema：AI 输出整体结构校验
 *
 * 注意：
 *   - 纯 TypeScript 类型声明已迁移至 @common/ai/ai.interface，本文件仅保留 Zod 运行时校验对象
 *   - 为保持向后兼容，VALID_COMPONENT_TYPES 等值仍从此文件 re-export
 */
import { z } from "zod";
import { VALID_COMPONENT_TYPES } from "@common/ai/ai.interface.js";

// Re-export 共用类型
export { VALID_COMPONENT_TYPES };
export type { ValidComponentType, AIGenerateRequest, AIResponse, AIComponent } from "@common/ai/ai.interface.js";

// ─── 请求体 ────────────────────────────────────────────────────

/** POST /surveys/generate Zod 校验 Schema */
export const generateSurveySchema = z.object({
  /** 用户自然语言描述 */
  prompt: z.string().min(5, "需求描述至少5个字符").max(2000, "需求描述最多2000个字符"),
  /** 期望题目数 */
  count: z.number().int().min(5).max(20).optional(),
  /** 问卷语言 */
  language: z.enum(["zh-CN", "en-US", "ja-JP"]).optional()
});

/** Zod 推断的请求体类型（等同于 @common 中的 AIGenerateRequest） */
export type GenerateSurveyInput = z.infer<typeof generateSurveySchema>;

// ─── AI 输出校验（宽松模式：过滤无效组件，返回有效部分） ────────

/** AI 输出组件 Zod 校验 Schema（对应 @common 中的 AIComponent） */
export const aiComponentSchema = z.object({
  type: z.string(),
  config: z.record(z.string(), z.unknown())
});

/** AI 输出整体结构 Zod 校验 Schema（对应 @common 中的 AIResponse） */
export const aiResponseSchema = z.object({
  title: z.string().min(1, "问卷标题不能为空"),
  description: z.string().optional().default(""),
  components: z.array(aiComponentSchema)
});
