/**
 * 用户行为采集器
 *
 * 自动采集低频用户交互事件：
 * - 按钮点击（采样 10%）
 * - 表单提交
 * - 页面滚动深度
 *
 * 高频事件（click、mousemove、scroll 持续触发）通过采样率控制数据量。
 *
 * @module collectors/behavior
 */

import type { Tracker } from "../core/tracker.js";

/** 点击事件的默认采样率（10%） */
const CLICK_SAMPLE_RATE = 0.1;

/**
 * 用户行为采集器。
 *
 * 自动监听 DOM 交互事件并以采样方式上报。
 */
export class BehaviorCollector {
  private tracker: Tracker;
  private registered: boolean;

  constructor(tracker: Tracker) {
    this.tracker = tracker;
    this.registered = false;
  }

  /**
   * 注册行为监听器。
   *
   * 应在 Tracker.init() 后调用。
   */
  register(): void {
    if (this.registered) return;
    this.registered = true;

    this.observeClicks();
    this.observeScrollDepth();
  }

  /**
   * 监听全局点击事件（事件委托，采样 10%）。
   */
  private observeClicks(): void {
    document.addEventListener(
      "click",
      (event: MouseEvent) => {
        // 采样控制
        if (Math.random() > CLICK_SAMPLE_RATE) return;

        const target = event.target as HTMLElement | null;
        if (!target) return;

        // 只上报带 data-track 属性或按钮/链接的点击
        const trackId = target.getAttribute("data-track-id");
        const tagName = target.tagName?.toLowerCase() || "";
        const isInteractive =
          tagName === "button" || tagName === "a" || target.getAttribute("role") === "button" || trackId !== null;

        if (!isInteractive) return;

        // 查找最近的含有 data-track-id 的祖先元素
        let resolvedTrackId = trackId;
        if (!resolvedTrackId) {
          let el: HTMLElement | null = target;
          while (el && el !== document.body) {
            const id = el.getAttribute("data-track-id");
            if (id) {
              resolvedTrackId = id;
              break;
            }
            el = el.parentElement;
          }
        }

        // 提取元素文本（截断）
        const elementText = (target.textContent || "").trim().slice(0, 50);

        this.tracker.track("component_click", "behavior", {
          element_id: resolvedTrackId || this.generateElementSelector(target),
          element_type: tagName,
          element_text: elementText,
          element_class: target.className?.toString()?.slice(0, 100) || ""
        });
      },
      true // 捕获阶段，确保在 stopPropagation 之前捕获
    );
  }

  /**
   * 监听页面滚动深度（25% / 50% / 75% / 100%）。
   *
   * 每个深度仅上报一次。
   */
  private observeScrollDepth(): void {
    const reported = new Set<number>();
    const thresholds = [25, 50, 75, 100];

    const checkDepth = (): void => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const percent = Math.round((scrollTop / docHeight) * 100);

      for (const threshold of thresholds) {
        if (percent >= threshold && !reported.has(threshold)) {
          reported.add(threshold);
          this.tracker.track("scroll_depth", "behavior", {
            depth_percent: threshold,
            page_url: window.location.href
          });
        }
      }

      // 所有深度均已上报，移除监听
      if (reported.size >= thresholds.length) {
        window.removeEventListener("scroll", scrollHandler);
      }
    };

    // 使用 passive 监听器 + requestIdleCallback 节流
    let ticking = false;
    const scrollHandler = (): void => {
      if (!ticking) {
        requestIdleCallback(() => {
          checkDepth();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", scrollHandler, { passive: true });
  }

  /**
   * 生成简单的 CSS 选择器用于标识元素。
   *
   * @param element - DOM 元素
   * @returns 选择器字符串
   */
  private generateElementSelector(element: HTMLElement): string {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const classes = element.className?.toString()?.trim()
      ? `.${element.className.toString().trim().split(/\s+/).slice(0, 2).join(".")}`
      : "";

    let prefix = "";
    if (element.parentElement) {
      const parentId = element.parentElement.id ? `#${element.parentElement.id} ` : "";
      prefix = parentId;
    }

    return `${prefix}${tag}${id}${classes}`;
  }
}
