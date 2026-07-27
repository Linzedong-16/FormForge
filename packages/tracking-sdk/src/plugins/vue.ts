/**
 * Vue 3 插件
 *
 * 将 Tracker 实例注入 Vue 应用，并提供：
 * - 全局属性 $tracker（Options API）
 * - provide/inject（Composition API）
 * - 自动错误捕获（app.config.errorHandler）
 * - 可选的路由 PV 采集
 *
 * @module plugins/vue
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { createTrackingPlugin } from 'monorepo-tracking-sdk/plugins/vue';
 *
 * const app = createApp(App);
 * const tracker = new Tracker({ appId: 'q-editor', endpoint: '/api/v1/track' });
 *
 * app.use(createTrackingPlugin(tracker, { router }));
 * app.mount('#app');
 * ```
 */

import type { App, Plugin } from "vue";
import type { Router } from "vue-router";
import type { Tracker } from "../core/tracker.js";
import { ErrorCollector } from "../collectors/error.js";
import { PageViewCollector } from "../collectors/page-view.js";

/** Vue 插件的全局属性类型声明 */
declare module "vue" {
  export interface ComponentCustomProperties {
    /** 埋点追踪器实例 */
    $tracker: Tracker;
  }
}

/**
 * Vue Tracking Plugin 配置选项。
 */
export interface VueTrackingPluginOptions {
  /** Vue Router 实例（可选），传入后自动采集 PV */
  router?: Router;
  /** 是否自动注册全局错误处理器，默认 true */
  captureErrors?: boolean;
  /** 是否自动采集页面浏览事件，默认 true */
  capturePageViews?: boolean;
}

/** provide/inject 的注入键 */
export const TRACKER_INJECTION_KEY = Symbol("tracker");

/**
 * 创建 Vue 3 Tracking Plugin。
 *
 * 此插件会：
 * 1. 将 tracker 实例通过 provide 注入，Composition API 中可通过 inject 获取
 * 2. 在 Vue 全局属性上挂载 $tracker
 * 3. 注册 app.config.errorHandler 自动捕获 Vue 组件错误
 * 4. 如果传入了 router，自动在 afterEach 钩子中上报 PV
 *
 * @param tracker - Tracker 实例
 * @param options - 插件配置选项
 * @returns Vue 3 Plugin 对象
 *
 * @example
 * ```ts
 * // ---- Composition API 中使用 ----
 * import { inject } from 'vue';
 * import { TRACKER_INJECTION_KEY } from 'monorepo-tracking-sdk/plugins/vue';
 *
 * const tracker = inject(TRACKER_INJECTION_KEY)!;
 * tracker.track('my_event', 'behavior', { key: 'value' });
 *
 * // ---- Options API 中使用 ----
 * this.$tracker.track('my_event', 'behavior', { key: 'value' });
 * ```
 */
export function createTrackingPlugin(tracker: Tracker, options: VueTrackingPluginOptions = {}): Plugin {
  return {
    install(app: App): void {
      // 注入 tracker 实例
      app.provide(TRACKER_INJECTION_KEY, tracker);

      // 挂载全局属性
      app.config.globalProperties.$tracker = tracker;

      // 注册 Vue 错误处理器
      if (options.captureErrors !== false) {
        const errorCollector = new ErrorCollector(tracker);

        app.config.errorHandler = (err: unknown, instance, info): void => {
          const error = err instanceof Error ? err : new Error(String(err));
          errorCollector.reportError(error, {
            component_name: instance?.$options?.name || instance?.$.type?.__name || "unknown",
            component_info: info,
            vue_error: true
          });
        };
      }

      // 注册页面浏览采集
      if (options.capturePageViews !== false) {
        const pvCollector = new PageViewCollector(tracker);
        pvCollector.register(options.router);
      }

      // 初始化 tracker（如果尚未初始化）
      if (!tracker.isInitialized) {
        tracker.init();
      }
    }
  };
}
