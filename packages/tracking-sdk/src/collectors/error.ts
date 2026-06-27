/**
 * 错误采集器
 *
 * 自动捕获四类前端错误：
 * 1. JS 运行时错误（window.onerror）
 * 2. Promise 未捕获异常（unhandledrejection）
 * 3. 静态资源加载错误（window error 事件，target 为资源节点）
 * 4. 手动上报的错误（通过 tracker.track 调用）
 *
 * @module collectors/error
 */

import type { Tracker } from "../core/tracker.js";

/** 错误堆栈的最大上报长度（字符） */
const MAX_STACK_LENGTH = 2048;

/**
 * 错误采集器。
 *
 * 在 Tracker.init() 时自动注册全局监听器。
 * 支持 Vue 和通用 Web 应用的错误捕获。
 */
export class ErrorCollector {
  private tracker: Tracker;
  private registered: boolean;

  constructor(tracker: Tracker) {
    this.tracker = tracker;
    this.registered = false;
  }

  /**
   * 注册全局错误监听器。
   *
   * 应在应用启动时调用一次。重复调用不会重复注册。
   */
  register(): void {
    if (this.registered) return;
    this.registered = true;

    this.registerJSErrorHandler();
    this.registerPromiseRejectionHandler();
    this.registerResourceErrorHandler();
  }

  /**
   * 从 Error 对象提取结构化的堆栈帧数组。
   *
   * @param error - Error 对象
   * @returns 堆栈信息对象
   */
  private extractErrorInfo(error: Error): {
    error_type: string;
    error_message: string;
    error_stack: string;
  } {
    return {
      error_type: error.name || "Error",
      error_message: (error.message || String(error)).slice(0, 500),
      error_stack: (error.stack || "").slice(0, MAX_STACK_LENGTH)
    };
  }

  /**
   * 注册 window.onerror 处理器（JS 运行时错误）。
   */
  private registerJSErrorHandler(): void {
    window.addEventListener("error", (event: ErrorEvent) => {
      // 仅处理 JS 错误（非资源加载错误）
      if (!(event instanceof ErrorEvent)) return;

      const errorInfo = {
        error_type: event.error?.name || "Error",
        error_message: (event.message || "Unknown error").slice(0, 500),
        error_stack: ((event.error as Error)?.stack || "").slice(0, MAX_STACK_LENGTH),
        filename: event.filename || "",
        lineno: event.lineno ?? 0,
        colno: event.colno ?? 0
      };

      this.tracker.track("js_error", "error", errorInfo);
    });
  }

  /**
   * 注册 unhandledrejection 处理器（Promise 未捕获异常）。
   */
  private registerPromiseRejectionHandler(): void {
    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      let errorInfo: Record<string, unknown>;

      if (event.reason instanceof Error) {
        errorInfo = {
          ...this.extractErrorInfo(event.reason),
          rejection_type: "promise"
        };
      } else {
        errorInfo = {
          error_type: "UnhandledRejection",
          error_message: String(event.reason).slice(0, 500),
          error_stack: "",
          rejection_type: "promise"
        };
      }

      this.tracker.track("js_error", "error", errorInfo);
    });
  }

  /**
   * 注册资源加载错误监听器。
   *
   * 通过捕获阶段的 error 事件识别资源加载失败（script/link/img）。
   */
  private registerResourceErrorHandler(): void {
    window.addEventListener(
      "error",
      (event: Event) => {
        const target = event.target as HTMLElement | null;
        // 仅处理资源加载错误
        if (!target || event instanceof ErrorEvent) return;

        const tagName = target.tagName?.toLowerCase() || "unknown";
        const resourceUrl =
          (target as HTMLScriptElement).src ||
          (target as HTMLLinkElement).href ||
          (target as HTMLImageElement).src ||
          "";

        if (!resourceUrl) return;

        this.tracker.track("resource_error", "error", {
          resource_url: resourceUrl.slice(0, 2048),
          resource_type: tagName,
          outer_html: target.outerHTML?.slice(0, 500) || ""
        });
      },
      true // 捕获阶段
    );
  }

  /**
   * 手动上报一个错误事件。
   *
   * 用于业务代码中 try-catch 捕获的可恢复错误。
   *
   * @param error - Error 对象
   * @param context - 可选的附加上下文信息
   *
   * @example
   * ```ts
   * try {
   *   await saveSurvey(data);
   * } catch (err) {
   *   errorCollector.reportError(err as Error, { surveyId: '123' });
   * }
   * ```
   */
  reportError(error: Error, context?: Record<string, unknown>): void {
    const errorInfo = this.extractErrorInfo(error);
    this.tracker.track("js_error", "error", {
      ...errorInfo,
      ...(context ?? {}),
      manual: true
    });
  }
}
