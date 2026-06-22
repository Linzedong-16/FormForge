/**
 * AI 模块 — 统一导出入口
 *
 * 模块组织：
 *   prompt-templates/   提示词模板（系统提示 + Few-shot 示例）
 *   schema-validator    AI 输出 JSON 校验与容错解析（生成 & 润色共用）
 *   ai-generate/        AI 一键生成问卷（SSE 流式）
 *   ai-polish/          AI 问卷润色（SSE 流式）— 新增
 *   ai-config/          AI 配置管理（管理员）
 */
export { AIGenerateService } from "./ai-generate/ai-generate.service.js";
export type { SSEEvent, GenerateOptions } from "./ai-generate/ai-generate.service.js";
export { validateAIResponse, parseJSONFromRawText, logAIRawResponse } from "./schema-validator.js";
export type { ValidationResult } from "./schema-validator.js";
export { buildSystemPrompt } from "./prompt-templates/system-prompt.js";
export type { SystemPromptOptions } from "./prompt-templates/system-prompt.js";
export { FEW_SHOT_EXAMPLES } from "./prompt-templates/few-shot-examples.js";
export type { AIFewShotExample } from "./prompt-templates/few-shot-examples.js";
export { generateSurveySchema, aiComponentSchema, aiResponseSchema } from "./ai-generate/ai-generate.schemas.js";
export type { GenerateSurveyInput, AIResponse, AIComponent } from "./ai-generate/ai-generate.schemas.js";
export { default as aiGenerateRoutes } from "./ai-generate/ai-generate.routes.js";

// ─── AI 问卷润色 ───────────────────────────────────────────────
export { AIPolishService } from "./ai-polish/ai-polish.service.js";
export { polishSurveySchema, polishComponentSchema, polishResponseSchema } from "./ai-polish/ai-polish.schemas.js";
export type { PolishSurveyInput } from "./ai-polish/ai-polish.schemas.js";
export { buildPolishSystemPrompt } from "./ai-polish/prompts/polish-prompt.js";
export type { PolishPromptOptions } from "./ai-polish/prompts/polish-prompt.js";
export { default as aiPolishRoutes } from "./ai-polish/ai-polish.routes.js";

// ─── AI 配置管理（管理员） ─────────────────────────────────────
export { AIConfigService } from "./ai-config/ai-config.service.js";
export type { UpdateAIConfigInput, AIConfigResponse } from "./ai-config/ai-config.schemas.js";
export { updateAIConfigSchema } from "./ai-config/ai-config.schemas.js";
export { default as aiConfigRoutes } from "./ai-config/ai-config.routes.js";
