/**
 * AI 模块 — 统一导出入口
 *
 * 模块组织：
 *   prompt-templates/   提示词模板（拆分为系统提示 + Few-shot 示例）
 *   schema-validator    AI 输出 JSON 校验与容错解析
 *   ai-generate.service  SSE 流式问卷生成核心服务
 *   ai-generate.schemas  Zod 校验 Schema
 *   ai-generate.routes   HTTP 路由
 */
export { AIGenerateService } from "./ai-generate.service.js";
export type { SSEEvent, GenerateOptions } from "./ai-generate.service.js";
export { validateAIResponse } from "./schema-validator.js";
export type { ValidationResult } from "./schema-validator.js";
export { buildSystemPrompt } from "./prompt-templates/system-prompt.js";
export type { SystemPromptOptions } from "./prompt-templates/system-prompt.js";
export { FEW_SHOT_EXAMPLES } from "./prompt-templates/few-shot-examples.js";
export type { AIFewShotExample } from "./prompt-templates/few-shot-examples.js";
export {
  generateSurveySchema,
  VALID_COMPONENT_TYPES,
  aiComponentSchema,
  aiResponseSchema
} from "./ai-generate.schemas.js";
export type { GenerateSurveyInput, ValidComponentType, AIResponse, AIComponent } from "./ai-generate.schemas.js";
export { default as aiGenerateRoutes } from "./ai-generate.routes.js";

// ─── AI 配置管理（管理员） ─────────────────────────────────────
export { AIConfigService } from "./ai-config.service.js";
export type { UpdateAIConfigInput, AIConfigResponse } from "./ai-config.schemas.js";
export { updateAIConfigSchema } from "./ai-config.schemas.js";
export { default as aiConfigRoutes } from "./ai-config.routes.js";
