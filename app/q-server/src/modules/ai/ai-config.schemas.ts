/**
 * AI 配置管理 — Zod 校验 Schema
 *
 * 接口：
 *   GET  /api/admin/config/ai    查询 AI 配置（Key 脱敏）
 *   PUT  /api/admin/config/ai    更新 AI 配置
 *
 * 注意：
 *   - 纯 TypeScript 类型声明已迁移至 @common/ai/ai.interface，本文件仅保留 Zod 运行时校验对象
 */
import { z } from "zod";
import type { UpdateAIConfigRequest, AIConfigResponse } from "@common/ai/ai.interface.js";

// Re-export 共用类型（向后兼容）
export type { UpdateAIConfigRequest, AIConfigResponse };

// ─── 请求体 ────────────────────────────────────────────────────

/** PUT /api/admin/config/ai — 更新 AI 配置 Zod 校验 Schema */
export const updateAIConfigSchema = z.object({
  /** DeepSeek API Key（必填，sk- 开头） */
  apiKey: z
    .string()
    .min(1, "API Key 不能为空")
    .max(256, "API Key 长度不能超过 256 字符")
    .refine(val => val.startsWith("sk-"), "API Key 必须以 sk- 开头"),
  /** 模型名称（可选，默认 deepseek-chat） */
  model: z.string().max(64, "模型名称长度不能超过 64 字符").optional(),
  /** 是否启用 AI 功能 */
  enabled: z.boolean()
});

/** Zod 推断的请求类型（等同于 @common 中的 UpdateAIConfigRequest） */
export type UpdateAIConfigInput = z.infer<typeof updateAIConfigSchema>;
