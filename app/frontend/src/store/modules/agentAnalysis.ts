/**
 * Agent 问卷分析对话 — 状态管理 (Pinia Store)
 *
 * 职责：
 *  - 管理分析会话历史（每次发起分析对应一条本地会话记录）
 *  - 封装 SSE 流式消费逻辑（createAgentAnalysisStream）
 *  - 会话历史持久化到 localStorage，并做数量裁剪与"脏进行中记录"修复
 *
 * 设计取舍（详见 app/frontend/src/views/agent-analysis/README.md）：
 *  - 不透传 session_id：后端未实现跨请求会话记忆，每次分析都是独立会话
 *  - 同一时间只允许一个进行中的分析（startAnalysis 在已有 streaming 会话时直接拒绝）
 *  - 页面刷新后 SSE 控制器引用丢失，持久化恢复时需强制修正"卡在进行中"的脏记录
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createAgentAnalysisStream, AgentStreamError, type AgentStreamErrorKind } from "monorepo-sse-client/agent";
import type { AgentAnalysisConclusion } from "monorepo-code-common";
import { useUserStore } from "@/store/modules/user";

/** 本地会话历史最大保留条数，超出裁剪最旧的记录 */
const MAX_SESSIONS = 20;

/** 单步工具调用轨迹（tool_call 与 tool_result 按 step 配对） */
export interface AgentToolTraceEntry {
  step: number;
  name: string;
  args: Record<string, unknown>;
  status: "calling" | "done";
  summary?: string | Record<string, unknown>;
}

/** 会话状态 */
export type AgentAnalysisStatus = "streaming" | "done" | "error" | "aborted";

/** 单条本地分析会话记录 */
export interface AgentAnalysisSession {
  id: string;
  survey_id: string;
  focus: string;
  /** 后端返回的 session_id，仅用于展示/日志关联，不具备上下文记忆能力 */
  backend_session_id: string | null;
  status: AgentAnalysisStatus;
  /** 最新 status 事件文案 */
  statusText: string;
  toolTrace: AgentToolTraceEntry[];
  /** token 事件逐步拼接的结论正文 */
  replyText: string;
  degraded: boolean;
  steps: number;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 错误分类 → 中文提示文案 */
function errorMessageByKind(kind: AgentStreamErrorKind, rawMessage: string): string {
  switch (kind) {
    case "unauthorized":
    case "forbidden":
      return "登录状态失效或权限不足，请重新登录后再试";
    case "rate_limited":
      return "请求过于频繁，请稍后再试（限流：10 次/分钟）";
    case "unavailable":
      return "AI 服务暂不可用，请稍后重试";
    default:
      return rawMessage || "分析过程中发生错误，请重试";
  }
}

export const useAgentAnalysisStore = defineStore(
  "agentAnalysis",
  () => {
    // ════════════════════════════════════════════════════════════
    //  状态
    // ════════════════════════════════════════════════════════════

    const sessions = ref<AgentAnalysisSession[]>([]);
    /** 当前 SSE 流控制器（运行态，不持久化） */
    let currentController: { abort: () => void } | null = null;
    /** 当前进行中会话的 ID（运行态，不持久化） */
    const activeSessionId = ref<string | null>(null);

    // ════════════════════════════════════════════════════════════
    //  计算属性
    // ════════════════════════════════════════════════════════════

    const isStreaming = computed(() => activeSessionId.value !== null);
    const activeSession = computed(() => sessions.value.find(s => s.id === activeSessionId.value) ?? null);

    // ════════════════════════════════════════════════════════════
    //  核心：发起分析
    // ════════════════════════════════════════════════════════════

    function startAnalysis(payload: { survey_id: string; focus?: string }): boolean {
      // 同一时间只允许一个进行中的分析
      if (isStreaming.value) return false;

      const now = Date.now();
      const session: AgentAnalysisSession = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        survey_id: payload.survey_id,
        focus: payload.focus?.trim() ?? "",
        backend_session_id: null,
        status: "streaming",
        statusText: "正在发起分析请求...",
        toolTrace: [],
        replyText: "",
        degraded: false,
        steps: 0,
        errorMessage: null,
        createdAt: now,
        updatedAt: now
      };

      sessions.value.unshift(session);
      if (sessions.value.length > MAX_SESSIONS) {
        sessions.value.length = MAX_SESSIONS;
      }
      activeSessionId.value = session.id;

      currentController = createAgentAnalysisStream({
        survey_id: payload.survey_id,
        ...(payload.focus?.trim() ? { focus: payload.focus.trim() } : {}),
        getToken: () => useUserStore().accessToken,
        onStatus(text) {
          const s = findSession(session.id);
          if (s) {
            s.statusText = text;
            s.updatedAt = Date.now();
          }
        },
        onToolCall(call) {
          const s = findSession(session.id);
          if (s) {
            s.toolTrace.push({ step: call.step, name: call.name, args: call.args, status: "calling" });
            s.updatedAt = Date.now();
          }
        },
        onToolResult(result) {
          const s = findSession(session.id);
          if (!s) return;
          const entry = s.toolTrace.find(t => t.step === result.step && t.name === result.name);
          if (entry) {
            entry.status = "done";
            entry.summary = result.summary;
          }
          s.updatedAt = Date.now();
        },
        onToken(text) {
          const s = findSession(session.id);
          if (s) {
            s.replyText += text;
            s.updatedAt = Date.now();
          }
        },
        onDone(conclusion: AgentAnalysisConclusion) {
          const s = findSession(session.id);
          if (s) {
            s.backend_session_id = conclusion.session_id;
            // 兜底：以 done.reply 校验/补全（正常情况下已由 token 事件逐步渲染完成）
            if (!s.replyText) s.replyText = conclusion.reply;
            s.steps = conclusion.steps;
            s.degraded = conclusion.degraded;
            s.status = "done";
            s.updatedAt = Date.now();
          }
          finishActive(session.id);
        },
        onError(err: AgentStreamError) {
          const s = findSession(session.id);
          if (s) {
            s.status = "error";
            s.errorMessage = errorMessageByKind(err.kind, err.message);
            s.updatedAt = Date.now();
          }
          finishActive(session.id);
        },
        onClose() {
          // 连接关闭但未收到 done → 视为异常断开（正常情况下 done 事件已先行落地状态）
          const s = findSession(session.id);
          if (s && s.status === "streaming") {
            s.status = "error";
            s.errorMessage = "连接异常断开，请重试";
            s.updatedAt = Date.now();
          }
          finishActive(session.id);
        }
      });

      return true;
    }

    /** 主动中止当前进行中的分析 */
    function abortCurrent() {
      if (!activeSessionId.value) return;
      const s = findSession(activeSessionId.value);
      if (s) {
        s.status = "aborted";
        s.errorMessage = null;
        s.updatedAt = Date.now();
      }
      currentController?.abort();
      currentController = null;
      activeSessionId.value = null;
    }

    /** 删除单条历史记录 */
    function removeSession(id: string) {
      if (activeSessionId.value === id) return; // 进行中的会话不允许删除，需先中止
      sessions.value = sessions.value.filter(s => s.id !== id);
    }

    /** 清空全部历史 */
    function clearHistory() {
      if (isStreaming.value) return; // 进行中时不清空，避免丢失活跃会话引用
      sessions.value = [];
    }

    // ── 内部工具函数 ──────────────────────────────────────────

    function findSession(id: string): AgentAnalysisSession | undefined {
      return sessions.value.find(s => s.id === id);
    }

    function finishActive(id: string) {
      if (activeSessionId.value === id) {
        activeSessionId.value = null;
        currentController = null;
      }
    }

    return {
      sessions,
      activeSessionId,
      isStreaming,
      activeSession,
      startAnalysis,
      abortCurrent,
      removeSession,
      clearHistory
    };
  },
  {
    persist: {
      key: "frontend-agent-analysis",
      storage: localStorage,
      pick: ["sessions"],
      // 持久化插件的 $patch 恢复发生在 setup() 之后，脏数据修复必须放在 afterHydrate 才能生效
      afterHydrate(ctx) {
        const sessions = (ctx.store as unknown as { sessions: AgentAnalysisSession[] }).sessions;
        for (const session of sessions) {
          if (session.status === "streaming") {
            session.status = "error";
            session.errorMessage = "页面已刷新，此前的分析连接已中断";
          }
        }
      }
    }
  }
);
