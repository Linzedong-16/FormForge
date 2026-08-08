/**
 * Agent 问卷分析 Store 单元测试
 *
 * 测试范围：
 *  - SSE 事件归约逻辑（status/tool_call/tool_result/token/done 依次触发）
 *  - 并发限制（同一时间仅允许一个进行中的分析）
 *  - 中止 / 删除 / 清空历史
 *  - 错误分类文案映射（401/403/429/503/未知）
 *  - onClose 异常断开兜底
 *  - 历史记录数量裁剪
 *  - 页面刷新后"卡在进行中"脏记录的修复（依赖 afterHydrate 钩子）
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApp } from "vue";
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";

// ══════════════════════════════════════════════════════════════
//  Mock 外部依赖
// ══════════════════════════════════════════════════════════════

/** 捕获 createAgentAnalysisStream 每次调用时传入的回调集合，供测试手动触发 */
const createStreamMock = vi.fn();

vi.mock("monorepo-sse-client/agent", () => {
  class AgentStreamError extends Error {
    status: number | undefined;
    kind: string;
    constructor(message: string, status: number | undefined, kind: string) {
      super(message);
      this.name = "AgentStreamError";
      this.status = status;
      this.kind = kind;
    }
  }
  return {
    createAgentAnalysisStream: (...args: unknown[]) => createStreamMock(...args),
    AgentStreamError
  };
});

vi.mock("@/store/modules/user", () => ({
  useUserStore: () => ({ accessToken: "mock-token" })
}));

import { useAgentAnalysisStore, type AgentAnalysisSession } from "@/store/modules/agentAnalysis";
import { AgentStreamError } from "monorepo-sse-client/agent";

/** 从最近一次 createAgentAnalysisStream 调用中取出传入的选项（含回调） */
function lastStreamOptions() {
  const call = createStreamMock.mock.calls.at(-1);
  if (!call) throw new Error("createAgentAnalysisStream 未被调用");
  return call[0] as {
    onStatus?: (text: string) => void;
    onToolCall?: (call: { step: number; name: string; args: Record<string, unknown> }) => void;
    onToolResult?: (result: { step: number; name: string; summary: string | Record<string, unknown> }) => void;
    onToken?: (text: string) => void;
    onDone?: (conclusion: unknown) => void;
    onError?: (err: unknown) => void;
    onClose?: () => void;
  };
}

/** 创建一个已完成 app.use 安装的 Pinia 实例：
 *  pinia.use(plugin) 仅在 pinia._a（已安装的 Vue app）存在时才会立即生效，
 *  否则插件会被排入 toBeInstalled 队列、直到 app.use(pinia) 才真正启用 ——
 *  测试环境没有真实 Vue app，必须手动 createApp().use(pinia) 补齐这一步，
 *  否则 pinia-plugin-persistedstate 的 hydrateStore 永远不会被调用（无报错，静默失效）。
 */
function createHydratedPinia() {
  const pinia = createPinia();
  createApp({}).use(pinia);
  pinia.use(piniaPluginPersistedstate);
  return pinia;
}

describe("useAgentAnalysisStore", () => {
  const abortSpy = vi.fn();

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    createStreamMock.mockReset();
    abortSpy.mockReset();
    createStreamMock.mockImplementation(() => ({ abort: abortSpy }));
  });

  // ── 初始状态 ──────────────────────────────────────────────

  describe("初始状态", () => {
    it("sessions 应为空数组", () => {
      const store = useAgentAnalysisStore();
      expect(store.sessions).toEqual([]);
    });

    it("isStreaming 应为 false", () => {
      const store = useAgentAnalysisStore();
      expect(store.isStreaming).toBe(false);
    });

    it("activeSession 应为 null", () => {
      const store = useAgentAnalysisStore();
      expect(store.activeSession).toBeNull();
    });
  });

  // ── SSE 事件归约 ──────────────────────────────────────────

  describe("startAnalysis 事件归约", () => {
    it("依次触发 status/tool_call/tool_result/token/done 后应正确落地各字段", () => {
      const store = useAgentAnalysisStore();
      const started = store.startAnalysis({ survey_id: "survey-1", focus: "重点关注文本题" });
      expect(started).toBe(true);
      expect(store.isStreaming).toBe(true);
      expect(store.sessions).toHaveLength(1);
      expect(store.sessions[0]?.status).toBe("streaming");

      const opts = lastStreamOptions();

      opts.onStatus?.("正在生成分析计划...");
      expect(store.sessions[0]?.statusText).toBe("正在生成分析计划...");

      opts.onToolCall?.({ step: 1, name: "get_survey_stats", args: { survey_id: "survey-1" } });
      expect(store.sessions[0]?.toolTrace).toHaveLength(1);
      expect(store.sessions[0]?.toolTrace[0]).toMatchObject({
        step: 1,
        name: "get_survey_stats",
        status: "calling"
      });

      opts.onToolResult?.({ step: 1, name: "get_survey_stats", summary: "共 120 条答卷" });
      expect(store.sessions[0]?.toolTrace[0]).toMatchObject({ status: "done", summary: "共 120 条答卷" });

      opts.onToken?.("分析");
      opts.onToken?.("结果：");
      expect(store.sessions[0]?.replyText).toBe("分析结果：");

      opts.onDone?.({
        session_id: "backend-session-1",
        reply: "完整结论文本",
        tool_calls: [],
        steps: 3,
        degraded: false
      });

      const session = store.sessions[0] as AgentAnalysisSession;
      expect(session.status).toBe("done");
      expect(session.steps).toBe(3);
      expect(session.degraded).toBe(false);
      expect(session.backend_session_id).toBe("backend-session-1");
      // token 事件已拼接完整正文，done.reply 仅作兜底，不应覆盖
      expect(session.replyText).toBe("分析结果：");
      expect(store.isStreaming).toBe(false);
      expect(store.activeSessionId).toBeNull();
    });

    it("token 事件为空（后端未逐字推送）时应以 done.reply 兜底", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });
      const opts = lastStreamOptions();

      opts.onDone?.({ session_id: "s1", reply: "兜底结论", tool_calls: [], steps: 1, degraded: false });

      expect(store.sessions[0]?.replyText).toBe("兜底结论");
    });

    it("degraded 为 true 时应正确落地", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });
      const opts = lastStreamOptions();

      opts.onDone?.({ session_id: "s1", reply: "结论", tool_calls: [], steps: 8, degraded: true });

      expect(store.sessions[0]?.degraded).toBe(true);
    });

    it("focus 为空字符串时应被裁剪为空串", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1", focus: "   " });
      expect(store.sessions[0]?.focus).toBe("");
    });
  });

  // ── 并发限制 ──────────────────────────────────────────────

  describe("并发限制", () => {
    it("已有进行中的分析时，再次 startAnalysis 应返回 false 且不新增会话", () => {
      const store = useAgentAnalysisStore();
      expect(store.startAnalysis({ survey_id: "survey-1" })).toBe(true);
      expect(store.startAnalysis({ survey_id: "survey-2" })).toBe(false);
      expect(store.sessions).toHaveLength(1);
      expect(createStreamMock).toHaveBeenCalledTimes(1);
    });
  });

  // ── 中止 ──────────────────────────────────────────────────

  describe("abortCurrent", () => {
    it("应调用底层 controller.abort，并将会话状态置为 aborted（而非 error）", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });

      store.abortCurrent();

      expect(abortSpy).toHaveBeenCalledTimes(1);
      expect(store.sessions[0]?.status).toBe("aborted");
      expect(store.sessions[0]?.errorMessage).toBeNull();
      expect(store.isStreaming).toBe(false);
      expect(store.activeSessionId).toBeNull();
    });

    it("没有进行中的分析时调用应为空操作", () => {
      const store = useAgentAnalysisStore();
      expect(() => store.abortCurrent()).not.toThrow();
      expect(abortSpy).not.toHaveBeenCalled();
    });
  });

  // ── 删除 / 清空历史 ──────────────────────────────────────

  describe("removeSession / clearHistory", () => {
    it("进行中的会话不允许删除", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });
      const id = store.sessions[0]?.id as string;

      store.removeSession(id);

      expect(store.sessions).toHaveLength(1);
    });

    it("非进行中的会话可以被删除", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });
      const opts = lastStreamOptions();
      opts.onDone?.({ session_id: "s1", reply: "done", tool_calls: [], steps: 1, degraded: false });
      const id = store.sessions[0]?.id as string;

      store.removeSession(id);

      expect(store.sessions).toHaveLength(0);
    });

    it("进行中时 clearHistory 应为空操作", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });

      store.clearHistory();

      expect(store.sessions).toHaveLength(1);
    });

    it("非进行中时 clearHistory 应清空全部历史", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });
      const opts = lastStreamOptions();
      opts.onDone?.({ session_id: "s1", reply: "done", tool_calls: [], steps: 1, degraded: false });

      store.clearHistory();

      expect(store.sessions).toHaveLength(0);
    });
  });

  // ── 错误分类文案映射 ──────────────────────────────────────

  describe("错误分类文案映射", () => {
    it.each([
      ["unauthorized", "登录状态失效或权限不足，请重新登录后再试"],
      ["forbidden", "登录状态失效或权限不足，请重新登录后再试"],
      ["rate_limited", "请求过于频繁，请稍后再试（限流：10 次/分钟）"],
      ["unavailable", "AI 服务暂不可用，请稍后重试"]
    ])("kind=%s 应映射为「%s」", (kind, expected) => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });
      const opts = lastStreamOptions();

      opts.onError?.(new AgentStreamError("原始错误信息", 500, kind));

      expect(store.sessions[0]?.status).toBe("error");
      expect(store.sessions[0]?.errorMessage).toBe(expected);
      expect(store.isStreaming).toBe(false);
    });

    it("kind=unknown 且携带原始信息时应展示原始信息", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });
      const opts = lastStreamOptions();

      opts.onError?.(new AgentStreamError("网络连接中断", undefined, "unknown"));

      expect(store.sessions[0]?.errorMessage).toBe("网络连接中断");
    });

    it("kind=unknown 且无原始信息时应展示通用文案", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });
      const opts = lastStreamOptions();

      opts.onError?.(new AgentStreamError("", undefined, "unknown"));

      expect(store.sessions[0]?.errorMessage).toBe("分析过程中发生错误，请重试");
    });
  });

  // ── onClose 兜底 ──────────────────────────────────────────

  describe("onClose 兜底", () => {
    it("未收到 done 事件就 close 时应判定为异常断开", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });
      const opts = lastStreamOptions();

      opts.onClose?.();

      expect(store.sessions[0]?.status).toBe("error");
      expect(store.sessions[0]?.errorMessage).toBe("连接异常断开，请重试");
      expect(store.isStreaming).toBe(false);
    });

    it("已收到 done 事件后再 close 不应覆盖已落地的 done 状态", () => {
      const store = useAgentAnalysisStore();
      store.startAnalysis({ survey_id: "survey-1" });
      const opts = lastStreamOptions();

      opts.onDone?.({ session_id: "s1", reply: "done", tool_calls: [], steps: 1, degraded: false });
      opts.onClose?.();

      expect(store.sessions[0]?.status).toBe("done");
    });
  });

  // ── 历史记录数量裁剪 ──────────────────────────────────────

  describe("历史记录裁剪", () => {
    it("超过 20 条时应裁剪最旧的记录", () => {
      const store = useAgentAnalysisStore();

      for (let i = 0; i < 21; i++) {
        store.startAnalysis({ survey_id: `survey-${i}` });
        const opts = lastStreamOptions();
        opts.onDone?.({ session_id: `s${i}`, reply: `结论-${i}`, tool_calls: [], steps: 1, degraded: false });
      }

      expect(store.sessions).toHaveLength(20);
      // unshift 插入，最新的在最前，最旧的（survey-0）应已被裁剪掉
      expect(store.sessions[0]?.survey_id).toBe("survey-20");
      expect(store.sessions.some(s => s.survey_id === "survey-0")).toBe(false);
    });
  });

  // ── 页面刷新脏数据修复（依赖持久化插件的 afterHydrate 钩子） ──

  describe("脏数据修复（持久化恢复）", () => {
    it("恢复出 status 仍为 streaming 的记录应被强制修正为 error", () => {
      const danglingSession: AgentAnalysisSession = {
        id: "dangling-1",
        survey_id: "survey-x",
        focus: "",
        backend_session_id: null,
        status: "streaming",
        statusText: "正在分析...",
        toolTrace: [],
        replyText: "",
        degraded: false,
        steps: 0,
        errorMessage: null,
        createdAt: 1,
        updatedAt: 1
      };
      localStorage.setItem("frontend-agent-analysis", JSON.stringify({ sessions: [danglingSession] }));

      const pinia = createHydratedPinia();
      setActivePinia(pinia);

      const store = useAgentAnalysisStore();

      expect(store.sessions).toHaveLength(1);
      expect(store.sessions[0]?.status).toBe("error");
      expect(store.sessions[0]?.errorMessage).toBe("页面已刷新，此前的分析连接已中断");
      expect(store.isStreaming).toBe(false);
    });

    it("恢复出的非 streaming 记录应保持原状态不变", () => {
      const doneSession: AgentAnalysisSession = {
        id: "done-1",
        survey_id: "survey-y",
        focus: "",
        backend_session_id: "backend-1",
        status: "done",
        statusText: "",
        toolTrace: [],
        replyText: "结论",
        degraded: false,
        steps: 2,
        errorMessage: null,
        createdAt: 1,
        updatedAt: 1
      };
      localStorage.setItem("frontend-agent-analysis", JSON.stringify({ sessions: [doneSession] }));

      const pinia = createHydratedPinia();
      setActivePinia(pinia);

      const store = useAgentAnalysisStore();

      expect(store.sessions[0]?.status).toBe("done");
    });
  });
});
