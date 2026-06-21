/**
 * 扩展模块 — API 层
 *
 * 提供扩展模块（AI 生成、模板市场等）的业务接口封装。
 * 当前包含：
 *   - AI 一键生成问卷 SSE 流式接口
 */

// Re-export AI generate stream from survey module
export { createAIGenerateStream } from "../../api/modules/survey/index";
export type { AIGenerateStreamOptions, AIComponentPreview, AIGenerateResult } from "monorepo-sse-client/ai";

// Re-export AI types from common (convenience)
export type { AIResponse, AIGenerateRequest } from "monorepo-code-common";
