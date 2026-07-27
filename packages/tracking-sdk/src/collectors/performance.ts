/**
 * 性能采集器
 *
 * 基于 Web Vitals API 采集核心性能指标：
 * - FCP (First Contentful Paint)
 * - LCP (Largest Contentful Paint)
 * - TTI (Time to Interactive，近似)
 * - CLS (Cumulative Layout Shift)
 * - INP (Interaction to Next Paint)
 *
 * 同时通过 PerformanceObserver 监听长任务和资源加载
 * （仅限 > 500ms 的慢资源，避免数据膨胀）。
 *
 * @module collectors/performance
 */

import type { Tracker } from "../core/tracker.js";

/** 慢资源阈值（毫秒），超过此值的资源才上报 */
const SLOW_RESOURCE_THRESHOLD_MS = 500;

/**
 * 性能采集器。
 *
 * 使用 PerformanceObserver API 低开销采集，不阻塞主线程。
 */
export class PerformanceCollector {
  private tracker: Tracker;
  private registered: boolean;

  constructor(tracker: Tracker) {
    this.tracker = tracker;
    this.registered = false;
  }

  /**
   * 注册所有性能观察器。
   */
  register(): void {
    if (this.registered) return;
    this.registered = true;

    this.observeWebVitals();
    this.observeResources();
    this.observeLongTasks();

    // 页面加载完成后采集 FCP 和导航时序
    if (document.readyState === "complete") {
      this.collectNavigationTiming();
    } else {
      window.addEventListener("load", () => this.collectNavigationTiming());
    }
  }

  /**
   * 采集 Web Vitals 指标。
   *
   * 使用 web-vitals 库或 PerformanceObserver 获取：
   * FCP、LCP、CLS、INP。
   */
  private observeWebVitals(): void {
    // ---- FCP ----
    this.observePaint("first-contentful-paint", "FCP");

    // ---- LCP ----
    this.observeLCP();

    // ---- CLS ----
    this.observeCLS();

    // ---- INP ----
    this.observeINP();
  }

  /**
   * 通用 Paint 观察器。
   */
  private observePaint(_type: "first-paint" | "first-contentful-paint", label: string): void {
    if (!("PerformanceObserver" in window)) return;

    try {
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          const entry = entries[entries.length - 1]; // 取最后一个
          if (label === "FCP") {
            this.pendingPerfData.fcp_ms = Math.round(entry.startTime);
          }
        }
        observer.disconnect();
      });

      observer.observe({ type: "paint", buffered: true });
    } catch {
      // PerformanceObserver 不支持 paint 类型
    }
  }

  /**
   * LCP 观察器。
   */
  private observeLCP(): void {
    if (!("PerformanceObserver" in window)) return;

    try {
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        // LCP 可能多次触发（页面加载过程中），取最后一次
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          this.pendingPerfData.lcp_ms = Math.round(lastEntry.startTime);
        }
      });

      observer.observe({ type: "largest-contentful-paint", buffered: true });

      // LCP 在页面完全加载后或用户交互时最终确定
      const finalizeLCP = (): void => {
        observer.disconnect();
      };
      window.addEventListener("load", finalizeLCP, { once: true });
      // 用户交互表示 LCP 已最终确定
      ["keydown", "click", "scroll"].forEach(eventName => {
        window.addEventListener(eventName, finalizeLCP, { once: true, passive: true });
      });
    } catch {
      // 不支持 LCP
    }
  }

  /**
   * CLS 观察器（累积布局偏移）。
   */
  private observeCLS(): void {
    if (!("PerformanceObserver" in window)) return;

    try {
      let clsValue = 0;

      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          // layout-shift 条目不含 hadRecentInput 的才计入 CLS
          const lsEntry = entry as PerformanceEntry & { hadRecentInput?: boolean; value: number };
          if (!lsEntry.hadRecentInput) {
            clsValue += lsEntry.value;
          }
        }
        this.pendingPerfData.cls = Math.round(clsValue * 1000) / 1000;
      });

      observer.observe({ type: "layout-shift", buffered: true });

      // 页面隐藏时 CLS 最终确定
      const finalize = (): void => {
        observer.disconnect();
      };
      window.addEventListener("pagehide", finalize, { once: true });
      window.addEventListener(
        "visibilitychange",
        () => {
          if (document.visibilityState === "hidden") finalize();
        },
        { once: true }
      );
    } catch {
      // 不支持 CLS
    }
  }

  /**
   * INP 观察器（交互延迟）。
   */
  private observeINP(): void {
    if (!("PerformanceObserver" in window)) return;

    try {
      let maxINP = 0;

      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          // event 类型的 performance entry
          const eEntry = entry as PerformanceEntry & { duration: number; interactionId?: number };
          if (eEntry.interactionId && eEntry.duration > maxINP) {
            maxINP = eEntry.duration;
          }
        }
        this.pendingPerfData.inp_ms = Math.round(maxINP);
      });

      observer.observe({ type: "event", buffered: true });
    } catch {
      // 不支持 INP
    }
  }

  /**
   * 采集 Navigation Timing API 数据（TTI 近似 + DNS/TCP 时序）。
   */
  private collectNavigationTiming(): void {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return;

    // TTI 近似 = domInteractive 时间
    const ttiMs = Math.round(nav.domInteractive);

    this.pendingPerfData.tti_ms = ttiMs;
    this.pendingPerfData.dns_ms = Math.round(nav.domainLookupEnd - nav.domainLookupStart);
    this.pendingPerfData.tcp_ms = Math.round(nav.connectEnd - nav.connectStart);
    this.pendingPerfData.ttfb_ms = Math.round(nav.responseStart - nav.requestStart);

    // 在 load 事件后延迟一点发送，确保 Web Vital 观察器都触发完毕
    setTimeout(() => this.reportPendingMetrics(), 2000);
  }

  /** 累积中的性能数据 */
  private pendingPerfData: Record<string, number> = {};

  /**
   * 上报累积的性能指标。
   */
  private reportPendingMetrics(): void {
    const data = { ...this.pendingPerfData };
    if (Object.keys(data).length === 0) return;

    // 排除无效值
    if (data.fcp_ms !== undefined && data.fcp_ms >= 0) {
      this.tracker.track("page_perf", "perf", data);
    }

    // 重置累积值，准备下一次路由的性能采集
    this.pendingPerfData = {};
  }

  /**
   * 观察资源加载性能（仅上报 > 500ms 的慢资源）。
   */
  private observeResources(): void {
    if (!("PerformanceObserver" in window)) return;

    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const rEntry = entry as PerformanceResourceTiming;
          if (rEntry.duration > SLOW_RESOURCE_THRESHOLD_MS) {
            this.tracker.track("resource_perf", "perf", {
              resource_url: rEntry.name.slice(0, 2048),
              duration_ms: Math.round(rEntry.duration),
              resource_type: rEntry.initiatorType,
              transfer_size: rEntry.transferSize ?? 0
            });
          }
        }
      });

      observer.observe({ type: "resource", buffered: true });
    } catch {
      // 不支持 resource observer
    }
  }

  /**
   * 观察长任务（> 50ms）。
   */
  private observeLongTasks(): void {
    if (!("PerformanceObserver" in window)) return;

    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          // 仅上报极其严重的长任务（> 500ms），避免数据膨胀
          if (entry.duration > 500) {
            this.tracker.track("long_task", "perf", {
              duration_ms: Math.round(entry.duration),
              name: entry.name
            });
          }
        }
      });

      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // 不支持 longtask
    }
  }

  /**
   * 手动上报自定义计时。
   *
   * 用于业务代码中测量特定操作耗时。
   *
   * @param name - 计时名称
   * @param durationMs - 耗时（毫秒）
   * @param context - 附加上下文
   *
   * @example
   * ```ts
   * const start = performance.now();
   * await heavyOperation();
   * perfCollector.trackTiming('heavy_operation', performance.now() - start);
   * ```
   */
  trackTiming(name: string, durationMs: number, context?: Record<string, unknown>): void {
    this.tracker.track("custom_timing", "perf", {
      timing_name: name,
      duration_ms: Math.round(durationMs),
      ...(context ?? {})
    });
  }
}
