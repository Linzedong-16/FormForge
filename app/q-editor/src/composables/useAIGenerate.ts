/**
 * AI 问卷生成 — 状态管理 Composable
 *
 * 职责：
 *   1. 管理 AI 生成流程的完整生命周期状态
 *   2. 封装 SSE 流式消费逻辑（createAIGenerateStream）
 *   3. 提供 AI 组件 → 编辑器 Status[] 转换入口
 *   4. 记录生成历史（最近 5 次）
 *
 * 设计原则：
 *   - 状态驱动 UI：所有 UI 状态通过 ref 暴露，组件仅消费状态
 *   - 异常处理：网络断开 / 超时 / 服务异常 → 统一错误消息
 *   - 可取消：外部通过 cancel() 终止 SSE 流
 */
import { ref, computed, onUnmounted } from "vue";
import { createAIGenerateStream } from "@/api/modules/survey";
import { aiComponentsToStatus } from "@/utils/aiToStatus";
import type { AIComponentPreview, AIGenerateResult } from "monorepo-sse-client/ai";
import { useUserStore } from "@/stores/useUser";

// ─── 历史记录（模块级，跨组件实例共享）─────────────────────────

/** 最多保留的历史记录数 */
const MAX_HISTORY = 5;

interface HistoryEntry {
  prompt: string;
  count: number;
  result: AIGenerateResult;
  timestamp: number;
}

const history = ref<HistoryEntry[]>([]);

// ─── 生成状态枚举 ─────────────────────────────────────────────

export type AIGeneratePhase = "idle" | "generating" | "done" | "error";

// ─── Composable ───────────────────────────────────────────────

export function useAIGenerate() {
  // ══════════════════════════════════════════════════════════
  //  请求参数
  // ══════════════════════════════════════════════════════════
  const prompt = ref("");
  const count = ref(10);
  const language = ref<"zh-CN" | "en-US" | "ja-JP">("zh-CN");

  // ══════════════════════════════════════════════════════════
  //  运行时状态
  // ══════════════════════════════════════════════════════════
  const phase = ref<AIGeneratePhase>("idle");
  /** 流式拼接的原始文本（用于打字机展示） */
  const streamText = ref("");
  /** 已解析的组件列表 */
  const components = ref<AIComponentPreview[]>([]);
  /** 错误消息 */
  const errorMessage = ref("");
  /** 生成完成后的结果 */
  const result = ref<AIGenerateResult | null>(null);

  // ══════════════════════════════════════════════════════════
  //  计算属性
  // ══════════════════════════════════════════════════════════
  const isIdle = computed(() => phase.value === "idle");
  const isGenerating = computed(() => phase.value === "generating");
  const isDone = computed(() => phase.value === "done");
  const isError = computed(() => phase.value === "error");
  const componentCount = computed(() => components.value.length);
  const hasResult = computed(() => result.value !== null && result.value.components.length > 0);

  // ══════════════════════════════════════════════════════════
  //  输入校验
  // ══════════════════════════════════════════════════════════

  function validateInput(): string | null {
    const trimmed = prompt.value.trim();
    if (!trimmed) return "aiEmptyPrompt";
    if (trimmed.length < 5) return "aiPromptTooShort";
    if (trimmed.length > 2000) return "aiPromptTooLong";
    return null;
  }

  // ══════════════════════════════════════════════════════════
  //  核心：开始生成
  // ══════════════════════════════════════════════════════════

  /** SSE 流控制器引用（用于用户主动取消） */
  let streamController: { abort: () => void } | null = null;

  async function generate() {
    // 前置校验
    const validationError = validateInput();
    if (validationError) {
      errorMessage.value = validationError;
      phase.value = "error";
      return;
    }

    // 重置状态
    phase.value = "generating";
    streamText.value = "";
    components.value = [];
    errorMessage.value = "";
    result.value = null;

    try {
      streamController = createAIGenerateStream({
        prompt: prompt.value.trim(),
        count: count.value,
        language: language.value,
        getToken: () => useUserStore().accessToken,
        onToken(text) {
          streamText.value += text;
        },
        onComponent(comp) {
          components.value = [...components.value, comp];
        },
        onDone(data) {
          console.log("[AI-Generate] 生成完成", {
            title: data.title,
            componentCount: data.components?.length ?? 0,
            warningCount: data.warnings?.length ?? 0,
            warnings: data.warnings,
            fullText: streamText.value.slice(-2000)
          });
          result.value = data;
          phase.value = "done";

          // 记录历史
          if (data.components.length > 0) {
            history.value.unshift({
              prompt: prompt.value,
              count: count.value,
              result: data,
              timestamp: Date.now()
            });
            if (history.value.length > MAX_HISTORY) {
              history.value.pop();
            }
          } else {
            errorMessage.value = "aiNoComponents";
            phase.value = "error";
          }
        },
        onError(msg) {
          console.error("[AI-Generate] 生成失败", {
            error: msg,
            textLength: streamText.value.length,
            fullText: streamText.value.slice(-2000)
          });
          // 根据错误消息映射 i18n key
          if (msg.includes("频繁")) {
            errorMessage.value = "aiRateLimitError";
          } else if (msg.includes("超时")) {
            errorMessage.value = "aiTimeoutError";
          } else if (msg.includes("取消")) {
            // 用户主动取消 → 回 idle
            phase.value = "idle";
            return;
          } else if (msg.includes("未配置") || msg.includes("AI 服务")) {
            errorMessage.value = "aiNotConfigured";
          } else if (msg.includes("网络") || msg.includes("连接")) {
            errorMessage.value = "aiNetworkError";
          } else {
            errorMessage.value = "aiServiceError";
          }
          phase.value = "error";
        },
        onClose() {
          // 连接关闭但未收到 done → 异常断开
          if (phase.value === "generating") {
            errorMessage.value = "aiNetworkError";
            phase.value = "error";
          }
        }
      });
    } catch (err) {
      console.error("AI generate stream error:", err);
      errorMessage.value = "aiNetworkError";
      phase.value = "error";
    }
  }

  /** 取消生成 */
  function cancel() {
    streamController?.abort();
    streamController = null;
    phase.value = "idle";
  }

  /** 重置为初始状态 */
  function reset() {
    cancel();
    streamText.value = "";
    components.value = [];
    errorMessage.value = "";
    result.value = null;
    phase.value = "idle";
  }

  /** 恢复到历史记录中的某次结果 */
  function restoreHistory(entry: HistoryEntry) {
    reset();
    prompt.value = entry.prompt;
    count.value = entry.count;
    result.value = entry.result;
    components.value = entry.result.components;
    phase.value = "done";
  }

  // 组件卸载时清理
  onUnmounted(() => {
    cancel();
  });

  return {
    // 参数
    prompt,
    count,
    language,
    // 状态
    phase,
    streamText,
    components,
    errorMessage,
    result,
    history,
    // 计算
    isIdle,
    isGenerating,
    isDone,
    isError,
    componentCount,
    hasResult,
    // 方法
    generate,
    cancel,
    reset,
    restoreHistory,
    validateInput,
    // 类型导出
    aiComponentsToStatus
  };
}
