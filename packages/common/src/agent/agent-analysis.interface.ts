/**
 * Agent 问卷分析模块 — 前后端通用 TypeScript 类型定义
 *
 * 对应后端：
 *   - ai-service: src/models/schemas.py（AnalysisRequest / AgentStreamEvent / ToolCallRecord / AnalysisConclusion）
 *   - q-server 代理：POST /api/ai/agent/analysis[/stream]（app/q-server/src/modules/ai-proxy）
 *
 * 命名约定：字段全部 snake_case，与后端 Pydantic 模型字段一一对齐。
 * 注意：本模块不复用 ./ai/ai.interface.ts 中已有的通用 SSEEvent 类型（事件词表不同），
 * 避免语义混淆，因此在 index.ts 中以显式具名导出方式暴露。
 */

// ============================================================
//  1. 请求体
// ============================================================

/**
 * POST /api/ai/agent/analysis[/stream] 请求体
 *
 * 前端约定：不透传 session_id —— 后端当前未实现跨请求会话记忆，
 * 传入 session_id 也不会带来"追问"上下文效果，故前端每次分析均视为独立新会话。
 */
export interface AgentAnalysisRequest {
  /** 问卷 ID（必填） */
  survey_id: string;
  /** 分析侧重点，留空表示对问卷做全面分析 */
  focus?: string;
}

// ============================================================
//  2. 工具调用记录 & 最终结论
// ============================================================

/** 单次工具调用记录 */
export interface AgentToolCallRecord {
  /** 工具名（get_survey_structure / get_survey_stats / list_survey_responses / analyze_text_batch） */
  tool_name: string;
  /** 模型生成的调用参数 */
  arguments: Record<string, unknown>;
  /** 工具执行结果摘要，失败时为 { error: true, message: string } 结构 */
  result_summary: string | Record<string, unknown>;
  /** 发生时对应的步数 */
  step_index: number;
  /** success / error */
  status: string;
}

/** 自主循环结束后产出的最终分析结论（对应 done 事件 data / 同步接口响应体） */
export interface AgentAnalysisConclusion {
  /** 会话 ID（仅用于展示/日志关联，不支持回传获得上下文记忆） */
  session_id: string;
  /** 分析结论正文 */
  reply: string;
  /** 本次分析产生的全部工具调用记录 */
  tool_calls: AgentToolCallRecord[];
  /** 自主循环实际执行的步数 */
  steps: number;
  /** 是否因步数/超时上限被强制收尾（结论可能不完整） */
  degraded: boolean;
}

// ============================================================
//  3. SSE 流事件（POST .../stream）
// ============================================================

/** SSE 事件名词表 */
export type AgentStreamEventName = "status" | "tool_call" | "tool_result" | "token" | "done" | "error";

/** status 事件：阶段性提示文案 */
export interface AgentStatusEventData {
  text: string;
}

/** tool_call 事件：Agent 发起了一次工具调用 */
export interface AgentToolCallEventData {
  name: string;
  args: Record<string, unknown>;
  step: number;
}

/** tool_result 事件：与对应 tool_call 关联的执行结果摘要 */
export interface AgentToolResultEventData {
  name: string;
  step: number;
  summary: string | Record<string, unknown>;
}

/** token 事件：结论文本的逐字/逐词增量 */
export interface AgentTokenEventData {
  text: string;
}

/** done 事件：流结束，携带完整结论 */
export type AgentDoneEventData = AgentAnalysisConclusion;

/** error 事件：请求级错误（如 survey_id 无效） */
export interface AgentErrorEventData {
  message: string;
}
