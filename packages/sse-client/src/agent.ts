/**
 * Agent 问卷分析 — SSE 客户端 Typed Wrapper
 *
 * 在 monorepo-sse-client 基础上提供 Agent 自主分析专用的类型安全封装。
 * 底层使用 POST /api/ai/agent/analysis/stream 发起 SSE 连接（q-server 代理转发至 ai-service）。
 *
 * 关键差异点（相对于 createSSEClient 的默认行为）：
 *   createSSEClient 的 onOpen 不校验 response.ok，非 2xx 响应（401/403/429/503）
 *   会被当作正常连接继续尝试解析 SSE 帧。这里在 onOpen 中显式校验状态码，
 *   非 2xx 时抛出携带 status/kind 的 AgentStreamError，使其经由内部 onerror
 *   转发到 onError 回调，从而让调用方能区分鉴权失败/限流/服务不可用与普通错误。
 *
 * @example
 * ```typescript
 * import { createAgentAnalysisStream } from "monorepo-sse-client/agent";
 *
 * const stream = createAgentAnalysisStream({
 *   survey_id: "123",
 *   focus: "文本题的情感倾向",
 *   getToken: () => useUserStore().accessToken,
 *   onStatus: (text) => showStatus(text),
 *   onToolCall: (call) => appendTrace(call),
 *   onToolResult: (result) => appendTraceResult(result),
 *   onToken: (text) => appendReply(text),
 *   onDone: (conclusion) => finish(conclusion),
 *   onError: (err) => showError(err),
 * });
 *
 * stream.abort();
 * ```
 */

import { createSSEClient, type SSEClientController } from "./index.js";
import type {
  AgentAnalysisRequest,
  AgentAnalysisConclusion,
  AgentStatusEventData,
  AgentToolCallEventData,
  AgentToolResultEventData
} from "monorepo-code-common";

// ══════════════════════════════════════════════════════════════
//  错误类型
// ══════════════════════════════════════════════════════════════

/** 错误分类：便于前端区分鉴权失败 / 限流 / 服务不可用 / 普通错误 */
export type AgentStreamErrorKind = "unauthorized" | "forbidden" | "rate_limited" | "unavailable" | "unknown";

/** Agent 分析流错误（携带 HTTP 状态码与分类） */
export class AgentStreamError extends Error {
  readonly status: number | undefined;
  readonly kind: AgentStreamErrorKind;

  constructor(message: string, status: number | undefined, kind: AgentStreamErrorKind) {
    super(message);
    this.name = "AgentStreamError";
    this.status = status;
    this.kind = kind;
  }
}

/** 根据 HTTP 状态码归类错误 */
function classifyStatus(status: number): AgentStreamErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status === 503) return "unavailable";
  return "unknown";
}

// ══════════════════════════════════════════════════════════════
//  类型定义
// ══════════════════════════════════════════════════════════════

/** Agent 分析 SSE 流配置选项 */
export interface AgentAnalysisStreamOptions extends AgentAnalysisRequest {
  /** Token 获取函数（必填，SSE 需要认证） */
  getToken: () => string | null;

  /** status 事件回调 — 阶段性提示文案 */
  onStatus?: (text: string) => void;

  /** tool_call 事件回调 — Agent 发起了一次工具调用 */
  onToolCall?: (call: AgentToolCallEventData) => void;

  /** tool_result 事件回调 — 与对应 tool_call 关联的执行结果摘要 */
  onToolResult?: (result: AgentToolResultEventData) => void;

  /** token 事件回调 — 结论文本的逐字/逐词增量，可用于打字机效果 */
  onToken?: (text: string) => void;

  /** done 事件回调 — 流结束，携带完整结论 */
  onDone?: (conclusion: AgentAnalysisConclusion) => void;

  /** 错误回调 — 请求级错误 / HTTP 非 2xx / 连接异常统一走此回调 */
  onError?: (error: AgentStreamError) => void;

  /** 连接打开回调（可选，仅在 HTTP 2xx 时触发） */
  onOpen?: (response: Response) => void;

  /** 连接关闭回调（可选） */
  onClose?: () => void;

  /** 外部 AbortSignal（用于集成取消） */
  signal?: AbortSignal;

  /** SSE 端点 URL（默认 /api/ai/agent/analysis/stream） */
  url?: string;

  /** 超时时间（毫秒，默认 90_000，对应后端 agent_timeout_seconds=60s 的建议冗余） */
  timeout?: number;
}

// ══════════════════════════════════════════════════════════════
//  工厂函数
// ══════════════════════════════════════════════════════════════

/**
 * 创建 Agent 问卷分析 SSE 流
 *
 * 这是 createSSEClient 的 Agent 分析专用封装，提供类型安全的分事件回调。
 * 请求体仅包含 survey_id / focus —— 不透传 session_id（后端未实现跨请求会话记忆）。
 *
 * @param options 分析流配置
 * @returns 流控制器（含 abort() 方法）
 */
export function createAgentAnalysisStream(options: AgentAnalysisStreamOptions): SSEClientController {
  const {
    survey_id,
    focus,
    getToken,
    onStatus,
    onToolCall,
    onToolResult,
    onToken,
    onDone,
    onError,
    onOpen,
    onClose,
    signal,
    url = "/api/ai/agent/analysis/stream",
    timeout = 90_000
  } = options;

  return createSSEClient({
    url,
    method: "POST",
    body: {
      survey_id,
      ...(focus !== undefined ? { focus } : {})
    },
    getToken,
    ...(signal !== undefined ? { signal } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    onOpen(response) {
      // createSSEClient 默认不校验 response.ok，这里显式校验并抛出分类错误，
      // 抛出的异常会被 fetchEventSource 捕获并转发到下方 onError。
      if (!response.ok) {
        throw new AgentStreamError(
          `请求失败（HTTP ${response.status}）`,
          response.status,
          classifyStatus(response.status)
        );
      }
      onOpen?.(response);
    },
    ...(onClose ? { onClose } : {}),
    onEvent(event, data) {
      switch (event) {
        case "status": {
          const text = (data as AgentStatusEventData)?.text;
          if (typeof text === "string") onStatus?.(text);
          break;
        }
        case "tool_call": {
          onToolCall?.(data as AgentToolCallEventData);
          break;
        }
        case "tool_result": {
          onToolResult?.(data as AgentToolResultEventData);
          break;
        }
        case "token": {
          const text = (data as { text: string })?.text;
          if (typeof text === "string") onToken?.(text);
          break;
        }
        case "done": {
          onDone?.(data as AgentAnalysisConclusion);
          break;
        }
        case "error": {
          const message = (data as { message: string })?.message ?? "未知错误";
          onError?.(new AgentStreamError(message, undefined, "unknown"));
          break;
        }
        default:
          // 未知事件类型静默忽略
          break;
      }
    },
    onError(err) {
      // AgentStreamError 由上方 onOpen 主动抛出，直接透传；
      // 其余异常（网络中断/超时等）统一归类为 unknown。
      if (err instanceof AgentStreamError) {
        onError?.(err);
      } else {
        onError?.(new AgentStreamError(err.message || "SSE 连接错误", undefined, "unknown"));
      }
    }
  });
}
