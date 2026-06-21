/**
 * AI 问卷生成 — SSE 客户端 Typed Wrapper
 *
 * 在 monorepo-sse-client 基础上提供 AI 生成专用的类型安全封装。
 * 利用 @common/ai/ai.interface 中的 SSEEvent 类型，提供：
 *   - onToken   → 打字机逐字回调
 *   - onComponent → 单个组件解析完成回调
 *   - onDone     → 生成完毕回调（含校验后完整数据）
 *   - onError    → 错误回调
 *
 * @example
 * ```typescript
 * import { createAIGenerateStream } from "monorepo-sse-client/ai";
 * import { useUserStore } from "@/stores/useUser";
 *
 * const stream = createAIGenerateStream({
 *   prompt: "生成一份员工敬业度调查问卷",
 *   count: 10,
 *   language: "zh-CN",
 *   getToken: () => useUserStore().accessToken,
 *   onToken: (text) => appendToText(text),
 *   onComponent: (comp) => addComponentToCanvas(comp),
 *   onDone: (result) => finalize(result),
 *   onError: (msg) => showError(msg),
 * });
 *
 * // 取消生成
 * stream.abort();
 * ```
 */

import { createSSEClient, type SSEClientController } from "./index.js";
import type { AIGenerateRequest, AIResponse } from "monorepo-code-common";

// ══════════════════════════════════════════════════════════════
//  类型定义
// ══════════════════════════════════════════════════════════════

/**
 * AI 生成的组件预览
 *
 * 对应 SSE event:component 的 data 结构。
 */
export interface AIComponentPreview {
  /** 组件在生成列表中的索引（0-based） */
  index: number;
  /** 组件类型（kebab-case，如 "single-select"） */
  type: string;
  /** 组件标题（从 config.title.status 提取） */
  title: string;
}

/**
 * AI 生成完成后的最终数据
 */
export interface AIGenerateResult {
  /** 问卷标题 */
  title: string;
  /** 问卷说明 */
  description: string;
  /** 生成的组件列表 */
  components: AIComponentPreview[];
  /** 校验过程中的警告信息 */
  warnings: string[];
}

/**
 * AI 生成 SSE 流配置选项
 */
export interface AIGenerateStreamOptions extends Omit<AIGenerateRequest, "prompt"> {
  /** 用户自然语言描述 */
  prompt: string;

  /** Token 获取函数（必填，SSE 需要认证） */
  getToken: () => string | null;

  /**
   * Token 回调 — AI 逐字输出时触发
   *
   * 可用于实现打字机效果。
   */
  onToken?: (text: string) => void;

  /**
   * 组件回调 — 单个组件解析完成时触发
   *
   * 可用于逐组件添加到编辑器画布。
   */
  onComponent?: (component: AIComponentPreview) => void;

  /**
   * 完成回调 — 生成完毕时触发
   *
   * data 包含最终校验后的问卷数据。
   */
  onDone?: (result: AIGenerateResult) => void;

  /**
   * 错误回调 — 生成过程发生错误时触发
   */
  onError?: (message: string) => void;

  /** 连接打开回调（可选） */
  onOpen?: (response: Response) => void;

  /** 连接关闭回调（可选） */
  onClose?: () => void;

  /** 外部 AbortSignal（用于集成取消） */
  signal?: AbortSignal;

  /** SSE 端点 URL（默认 /api/surveys/generate） */
  url?: string;

  /** 超时时间（毫秒，默认 60_000） */
  timeout?: number;
}

// ══════════════════════════════════════════════════════════════
//  工厂函数
// ══════════════════════════════════════════════════════════════

/**
 * 创建 AI 问卷生成 SSE 流
 *
 * 这是 createSSEClient 的 AI 专用封装，提供类型安全的事件回调。
 * 底层使用 POST /api/surveys/generate 发起 SSE 连接。
 *
 * @param options  生成选项
 * @returns 流控制器（含 abort() 方法）
 */
export function createAIGenerateStream(options: AIGenerateStreamOptions): SSEClientController {
  const {
    prompt,
    count,
    language,
    getToken,
    onToken,
    onComponent,
    onDone,
    onError,
    onOpen,
    onClose,
    signal,
    url = "/api/surveys/generate",
    timeout = 60_000
  } = options;

  // 用 spread 条件构建 避免 exactOptionalPropertyTypes 下 undefined 赋值报错
  return createSSEClient({
    url,
    method: "POST",
    body: {
      prompt,
      ...(count !== undefined ? { count } : {}),
      ...(language !== undefined ? { language } : {})
    },
    getToken,
    ...(signal !== undefined ? { signal } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    ...(onOpen ? { onOpen } : {}),
    ...(onClose ? { onClose } : {}),
    onEvent(event, data) {
      switch (event) {
        case "token": {
          const text = (data as { text: string })?.text;
          if (typeof text === "string") onToken?.(text);
          break;
        }
        case "component": {
          const comp = data as AIComponentPreview;
          if (comp && typeof comp.type === "string") onComponent?.(comp);
          break;
        }
        case "done": {
          const result = data as {
            title: string;
            description: string;
            components: AIComponentPreview[];
            _warnings: string[];
          };
          onDone?.({
            title: result?.title ?? "",
            description: result?.description ?? "",
            components: result?.components ?? [],
            warnings: result?._warnings ?? []
          });
          break;
        }
        case "error": {
          const msg = (data as { message: string })?.message ?? "未知错误";
          onError?.(msg);
          break;
        }
        default:
          // 未知事件类型静默忽略
          break;
      }
    },
    onError(err) {
      onError?.(err.message || "SSE 连接错误");
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  类型再导出（便捷引用）
// ══════════════════════════════════════════════════════════════

export type { AIResponse, AIGenerateRequest };
