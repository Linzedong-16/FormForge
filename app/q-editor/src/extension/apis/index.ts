/**
 * 扩展模块 — API 层
 *
 * 提供扩展模块（AI 生成、AI 润色、模板市场等）的业务接口封装。
 */

// Re-export AI generate stream from survey module
export { createAIGenerateStream } from "../../api/modules/survey/index";
export type { AIGenerateStreamOptions, AIComponentPreview, AIGenerateResult } from "monorepo-sse-client/ai";

// Re-export AI polish stream from survey module
export { createAIPolishStream } from "../../api/modules/survey/index";
export type { AIPolishStreamOptions, AIPolishResult } from "monorepo-sse-client/ai";

// Re-export AI types from common (convenience)
export type {
  AIResponse,
  AIGenerateRequest,
  AIPolishRequest,
  SurveyContent,
  AIPolishAspect
} from "monorepo-code-common";
