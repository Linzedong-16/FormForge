/**
 * SSE (Server-Sent Events) 客户端封装
 *
 * 基于 @microsoft/fetch-event-source 库，提供：
 *   - POST 请求支持（原生 EventSource 仅支持 GET）
 *   - Bearer Token 自动注入
 *   - AbortSignal 取消控制
 *   - 类型安全的事件回调
 *   - 连接超时
 *
 * 设计目标：
 *   跨前端模块复用（q-editor / frontend / 未来小程序端等均可直接使用）
 *
 * @example
 * ```typescript
 * import { createSSEClient } from "monorepo-sse-client";
 *
 * const stream = createSSEClient({
 *   url: "/api/surveys/generate",
 *   body: { prompt: "生成一份员工满意度调查" },
 *   getToken: () => useUserStore().accessToken,
 *   onEvent: (event, data) => {
 *     if (event === "token") showTyping(data.text);
 *     if (event === "component") addToCanvas(data);
 *     if (event === "done") finishGeneration(data);
 *   },
 *   onError: (err) => showError(err.message),
 * });
 *
 * // 用户可随时取消
 * stream.abort();
 * ```
 */

import { fetchEventSource, type EventSourceMessage, type FetchEventSourceInit } from "@microsoft/fetch-event-source";

// ══════════════════════════════════════════════════════════════
//  类型定义
// ══════════════════════════════════════════════════════════════

/**
 * SSE 流配置选项
 */
export interface SSEClientOptions {
  /** SSE 端点 URL（如 "/api/surveys/generate"） */
  url: string;

  /** HTTP 方法（默认 POST） */
  method?: "GET" | "POST";

  /** 请求体（POST 时序列化为 JSON） */
  body?: Record<string, unknown>;

  /** 额外请求头（Authorization 会自动注入，无需手动添加） */
  headers?: Record<string, string>;

  /**
   * Token 获取函数
   *
   * 每次连接前调用，支持动态获取（如从 Pinia Store 读取）。
   * 返回 null 表示跳过 Authorization 头。
   */
  getToken?: () => string | null;

  /**
   * 通用事件回调（原始 event 名 + 已解析 JSON data）
   *
   * @param event SSE event 名称（如 "token", "component", "done", "error"）
   * @param data  已 JSON.parse 的事件数据，或原始字符串（解析失败时）
   */
  onEvent?: (event: string, data: unknown) => void;

  /** 连接打开回调（HTTP 200 后触发，可用于确认连接建立） */
  onOpen?: (response: Response) => void;

  /** 错误回调 */
  onError?: (error: Error) => void;

  /** 连接关闭回调 */
  onClose?: () => void;

  /**
   * 外部 AbortSignal（用于父组件取消）
   *
   * 传入后可响应外部取消信号（如父组件的 AbortSignal），
   * 内部也会创建自有的 AbortController 用于 abort() 方法。
   */
  signal?: AbortSignal;

  /** 连接超时（毫秒，默认 60_000） */
  timeout?: number;
}

/**
 * SSE 流控制器
 *
 * 返回给调用方，提供 abort() 方法用于主动取消。
 */
export interface SSEClientController {
  /** 主动取消 SSE 连接 */
  abort: () => void;
}

// ══════════════════════════════════════════════════════════════
//  工厂函数
// ══════════════════════════════════════════════════════════════

/**
 * 创建一个 SSE 流式连接
 *
 * 内部使用 @microsoft/fetch-event-source，支持：
 *   - POST 请求（携带 JSON body）
 *   - Bearer Token 自动注入
 *   - AbortController 取消
 *   - 超时保护
 *
 * @param options  SSE 配置选项
 * @returns 控制器（含 abort() 方法）
 */
export function createSSEClient(options: SSEClientOptions): SSEClientController {
  const {
    url,
    method = "POST",
    body,
    headers = {},
    getToken,
    onEvent,
    onOpen,
    onError,
    onClose,
    signal: externalSignal,
    timeout = 60_000
  } = options;

  // 内部 AbortController（用于 abort() 主动取消 + 超时）
  const internalController = new AbortController();
  const timeoutId = setTimeout(() => internalController.abort(), timeout);

  // 合并外部 + 内部 signal
  const mergedSignal = externalSignal
    ? combineAbortSignals(externalSignal, internalController.signal)
    : internalController.signal;

  // 构建请求头
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers
  };
  if (getToken) {
    const token = getToken();
    if (token) {
      finalHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  // 发起 SSE 连接（fire-and-forget，事件通过回调返回）
  // 用 spread 条件构建 避免 exactOptionalPropertyTypes 下 body: undefined 报错
  const init: FetchEventSourceInit = {
    method,
    headers: finalHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: mergedSignal,
    openWhenHidden: true,
    onopen(response) {
      clearTimeout(timeoutId);
      onOpen?.(response);
      return Promise.resolve();
    },
    onmessage(msg: EventSourceMessage) {
      // 跳过 SSE 注释行（以冒号开头的空事件）
      if (msg.event === "" && msg.data.startsWith("")) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.data);
      } catch {
        parsed = msg.data;
      }
      onEvent?.(msg.event, parsed);
    },
    onerror(err) {
      clearTimeout(timeoutId);
      onError?.(err);
      // 不重试（抛异常让 fetchEventSource 终止）
      throw err;
    },
    onclose() {
      clearTimeout(timeoutId);
      onClose?.();
    }
  };

  // 发起异步连接（不 await）
  fetchEventSource(url, init).catch(err => {
    // 忽略 AbortError（正常取消）
    if (err.name !== "AbortError") {
      onError?.(err);
    }
  });

  return {
    abort: () => {
      clearTimeout(timeoutId);
      internalController.abort();
    }
  };
}

// ══════════════════════════════════════════════════════════════
//  工具函数
// ══════════════════════════════════════════════════════════════

/**
 * 合并多个 AbortSignal
 *
 * 当任意一个 signal 被 abort 时，merged 也会 abort。
 * 当 merged 被 abort 时，不会影响原始 signal。
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  return controller.signal;
}
