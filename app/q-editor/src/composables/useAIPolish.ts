/**
 * AI 问卷润色 — 状态管理 Composable
 *
 * 职责：
 *   1. 管理 AI 润色流程的完整生命周期状态
 *   2. 封装 SSE 流式消费逻辑（createAIPolishStream）
 *   3. 提供当前编辑器问卷 → 润色请求数据的转换
 *   4. 润色完成后自动替换编辑器内容
 *
 * 复用 useAIGenerate 的 SSE 模式和错误处理策略。
 */
import { ref, computed } from "vue";
import { createAIPolishStream } from "@/api/modules/survey";
import { aiComponentsToStatus } from "@/utils/aiToStatus";
import { useEditorStore } from "monorepo-survey-engine";
import { useUserStore } from "@/stores/useUser";
import type { AIPolishResult } from "monorepo-sse-client/ai";
import type { SurveyContent } from "monorepo-code-common";

// ─── 状态枚举 ─────────────────────────────────────────────────

export type AIPolishPhase = "idle" | "polishing" | "done" | "error";

// ─── Composable ───────────────────────────────────────────────

export function useAIPolish() {
  // 请求参数
  const instructions = ref("");
  const aspects = ref<string[]>([]);

  // 运行时状态
  const phase = ref<AIPolishPhase>("idle");
  const streamText = ref(""); // 流式文本累积
  const result = ref<AIPolishResult | null>(null);
  const errorMessage = ref("");

  let streamController: ReturnType<typeof createAIPolishStream> | null = null;

  // ─── 计算属性 ──────────────────────────────────────────────

  const isIdle = computed(() => phase.value === "idle");
  const isPolishing = computed(() => phase.value === "polishing");
  const isDone = computed(() => phase.value === "done");
  const isError = computed(() => phase.value === "error");
  const hasResult = computed(() => result.value !== null);
  const changeCount = computed(() => result.value?.changes?.length ?? 0);

  // ─── 构建润色请求的问卷内容 ─────────────────────────────────

  /** 从编辑器 store 提取当前问卷的序列化内容 */
  function buildSurveyContent(): SurveyContent {
    const store = useEditorStore();
    // 提取标题和描述（从第一个 text-note 组件的 desc 字段）
    const firstTextNote = store.coms.find(c => c.name === "text-note");
    const title = (firstTextNote?.status?.title as any)?.status ?? "";
    const description = (firstTextNote?.status?.desc as any)?.status ?? "";

    // 序列化组件：移除 Vue 组件引用，保留纯数据
    const components = store.coms.map(com => ({
      type: com.name,
      config: serializeStatus(com.status)
    }));

    return { title: String(title), description: String(description), components };
  }

  /**
   * 将编辑器 Status 序列化为 AI 可理解的精简格式
   *
   * AI 润色只需要知道题型和核心内容（标题/描述/选项），不需要编辑器元数据。
   * 输出格式与 AI 一键生成的输出保持一致：{ title: { status, isShow }, desc: { status, isShow }, options?: { status, isShow } }
   */
  function serializeStatus(statusObj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(statusObj)) {
      const value = statusObj[key];
      if (value === null || value === undefined) continue;
      if (typeof value === "function") continue;

      if (typeof value === "object" && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        // 仅保留 status 和 isShow 字段，丢弃 name/id/editCom/type/currentStatus 等编辑器元数据
        result[key] = {
          status: obj.status,
          isShow: obj.isShow
        };
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  // ─── 核心流程 ──────────────────────────────────────────────

  async function polish() {
    if (!instructions.value.trim()) return;

    const store = useEditorStore();
    if (store.coms.length === 0) {
      errorMessage.value = "编辑器中没有问卷内容，请先创建问卷";
      phase.value = "error";
      return;
    }

    // 重置状态
    phase.value = "polishing";
    streamText.value = "";
    result.value = null;
    errorMessage.value = "";
    let sseRawText = "";
    const logSSEText = (stage: "done" | "error" | "close") => {
      console.log(`[AI-Polish] SSE 原始文本（${stage}）`, {
        textLength: sseRawText.length,
        text: sseRawText
      });
    };

    const userStore = useUserStore();
    const surveyContent = buildSurveyContent();

    streamController = createAIPolishStream({
      surveyContent,
      instructions: instructions.value.trim(),
      aspects: aspects.value.length > 0 ? aspects.value : undefined,
      language: "zh-CN",
      getToken: () => userStore.accessToken,
      onToken(text) {
        sseRawText += text;
        streamText.value = sseRawText;
      },
      onDone(data) {
        logSSEText("done");
        console.log("[AI-Polish] 润色完成", {
          title: data.title,
          componentCount: data.components?.length ?? 0,
          changeCount: data.changes?.length ?? 0,
          warningCount: data.warnings?.length ?? 0,
          warnings: data.warnings
        });
        result.value = data;
        phase.value = "done";
      },
      onError(msg) {
        logSSEText("error");
        console.error("[AI-Polish] 润色失败", { error: msg, textLength: streamText.value.length });
        // 错误消息映射（复用 generate 的策略）
        if (msg.includes("频繁")) {
          errorMessage.value = "请求过于频繁，请稍后再试";
        } else if (msg.includes("超时")) {
          errorMessage.value = "AI 润色超时，请重试";
        } else if (msg.includes("取消")) {
          errorMessage.value = "润色已取消";
        } else if (msg.includes("未配置") || msg.includes("关闭")) {
          errorMessage.value = "AI 服务未启用，请联系管理员";
        } else {
          errorMessage.value = msg;
        }
        phase.value = "error";
      },
      onClose() {
        // 连接异常关闭但未触发 done/error
        if (phase.value === "polishing") {
          logSSEText("close");
          errorMessage.value = "连接意外断开，请检查网络";
          phase.value = "error";
        }
      }
    });
  }

  /** 取消润色 */
  function cancel() {
    streamController?.abort();
    streamController = null;
    if (phase.value === "polishing") {
      phase.value = "idle";
    }
  }

  /** 将润色结果应用到编辑器（完全替换当前内容） */
  function applyToEditor(): string[] {
    if (!result.value) return ["润色结果为空"];

    // 优先使用 _rawComponents（完整 config），fallback 到 components 摘要
    const rawComponents: Array<{ type: string; config: Record<string, unknown> }> =
      result.value._rawComponents ??
      result.value.components.map(c => ({
        type: c.type,
        config: {} as Record<string, unknown>
      }));

    console.log("[AI-Polish] applyToEditor 输入 rawComponents", {
      count: rawComponents.length,
      sample: rawComponents.slice(0, 3)
    });

    if (rawComponents.length === 0) return ["润色结果为空"];

    const { statuses, warnings } = aiComponentsToStatus(rawComponents);

    console.log("[AI-Polish] aiComponentsToStatus 输出", {
      count: statuses.length,
      warnings,
      sample: statuses.slice(0, 2).map(s => ({
        name: s.name,
        title: (s.status as any)?.title?.status,
        desc: (s.status as any)?.desc?.status,
        options: (s.status as any)?.options?.status
      }))
    });

    const store = useEditorStore();
    store.resetComs();
    for (const status of statuses) {
      store.addCom(status);
    }

    return warnings;
  }

  /** 重置到空闲状态 */
  function reset() {
    cancel();
    phase.value = "idle";
    streamText.value = "";
    result.value = null;
    errorMessage.value = "";
  }

  return {
    // 参数
    instructions,
    aspects,
    // 状态
    phase,
    streamText,
    result,
    errorMessage,
    // 计算
    isIdle,
    isPolishing,
    isDone,
    isError,
    hasResult,
    changeCount,
    // 方法
    polish,
    cancel,
    applyToEditor,
    reset
  };
}
