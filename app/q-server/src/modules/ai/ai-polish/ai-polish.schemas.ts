/**
 * AI 问卷润色 — Zod 校验 Schema
 */
import { z } from "zod";
import { AI_POLISH_ASPECTS } from "@common/ai/ai.interface.js";

// Re-export 共用类型
export type { AIPolishRequest, SurveyContent, AIPolishAspect } from "@common/ai/ai.interface.js";

// ─── 请求体 ────────────────────────────────────────────────────

/** POST /surveys/polish Zod 校验 Schema */
export const polishSurveySchema = z.object({
  /** 待润色的问卷内容 */
  surveyContent: z.object({
    title: z.string().min(1, "问卷标题不能为空"),
    description: z.string().optional().default(""),
    components: z
      .array(
        z.object({
          type: z.string(),
          config: z.record(z.string(), z.unknown())
        })
      )
      .min(1, "问卷至少需要 1 道题目")
  }),
  /** 用户润色指令 */
  instructions: z.string().min(1, "润色指令不能为空").max(2000, "润色指令最多2000个字符"),
  /** 润色维度 */
  aspects: z.array(z.enum(AI_POLISH_ASPECTS as unknown as [string, ...string[]])).optional(),
  /** 问卷语言 */
  language: z.enum(["zh-CN", "en-US", "ja-JP"]).optional()
});

export type PolishSurveyInput = z.infer<typeof polishSurveySchema>;

// ─── 润色输出校验 ──────────────────────────────────────────────

/** 润色输出组件（与 AIComponent 一致） */
export const polishComponentSchema = z.object({
  type: z.string(),
  config: z.record(z.string(), z.unknown())
});

/** 润色输出完整结构（含 changes 变更说明） */
export const polishResponseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  components: z.array(polishComponentSchema),
  changes: z.array(z.string()).optional().default([])
});
