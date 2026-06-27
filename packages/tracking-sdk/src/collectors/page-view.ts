/**
 * 页面浏览（Page View）采集器
 *
 * 支持两种模式：
 * 1. 传统模式：监听 popstate / hashchange（多页应用）
 * 2. Router 模式：通过 Vue Router hooks 自动上报（SPA）
 *
 * @module collectors/page-view
 */

import type { Tracker } from "../core/tracker.js";
import type { Router } from "vue-router";

/**
 * 页面浏览采集器。
 *
 * 自动在路由变化时上报 page_view 事件。
 */
export class PageViewCollector {
  private tracker: Tracker;
  private registered: boolean;

  constructor(tracker: Tracker) {
    this.tracker = tracker;
    this.registered = false;
  }

  /**
   * 注册页面浏览监听。
   *
   * 对于 SPA 应用，最佳实践是传入 Vue Router 实例，
   * 这样可以在 afterEach 钩子中准确捕获路由变化。
   *
   * @param router - 可选的 Vue Router 实例
   *
   * @example
   * ```ts
   * // SPA 应用（推荐）
   * import { createRouter } from 'vue-router';
   * const router = createRouter({ ... });
   * pageViewCollector.register(router);
   *
   * // 通用 Web 应用
   * pageViewCollector.register();
   * ```
   */
  register(router?: Router): void {
    if (this.registered) return;
    this.registered = true;

    if (router) {
      this.registerVueRouterHook(router);
    } else {
      this.registerHistoryHooks();
    }

    // 首次页面加载上报一次
    this.reportPageView();
  }

  /**
   * 通过 Vue Router afterEach 钩子采集页面浏览。
   */
  private registerVueRouterHook(router: Router): void {
    router.afterEach(
      (
        to: { fullPath: string; name?: string | symbol | null; query: Record<string, unknown> },
        from?: { fullPath: string }
      ) => {
        this.reportPageView({
          prev_page: from?.fullPath ?? "",
          route_name: to.name?.toString() ?? "",
          route_path: to.fullPath,
          query_params: this.sanitizeQueryParams(to.query)
        });
      }
    );
  }

  /**
   * 通过浏览器 History API 监听页面变化（非 SPA）。
   */
  private registerHistoryHooks(): void {
    const handleChange = (): void => {
      // 延迟一点确保 document.title 已更新
      setTimeout(() => this.reportPageView(), 100);
    };

    window.addEventListener("popstate", handleChange);
    window.addEventListener("hashchange", handleChange);

    // 包装 pushState 和 replaceState
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = function (...args) {
      originalPushState(...args);
      handleChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState(...args);
      handleChange();
    };
  }

  /**
   * 上报 page_view 事件。
   */
  private reportPageView(extra?: Record<string, unknown>): void {
    // 页面浏览不需要采样，始终上报
    this.tracker.track("page_view", "behavior", {
      referrer: document.referrer ? this.truncate(document.referrer, 2048) : "",
      ...(extra ?? {})
    });
  }

  /**
   * 清洗 query 参数，移除 token / code 等敏感值。
   */
  private sanitizeQueryParams(query: Record<string, unknown>): Record<string, unknown> {
    const SENSITIVE = ["token", "code", "sign", "signature", "access_token"];
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query)) {
      if (SENSITIVE.includes(key)) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = typeof value === "string" ? this.truncate(value, 200) : value;
      }
    }
    return sanitized;
  }

  /**
   * 截断字符串。
   */
  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? value.slice(0, maxLength) : value;
  }
}
