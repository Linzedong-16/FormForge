import "./public-path";
import { createApp, type App } from "vue";
import { createPinia } from "pinia";
import { renderWithQiankun, qiankunWindow } from "vite-plugin-qiankun/es/helper";
import "./style.css";
import "@arco-design/web-vue/dist/arco.css";
// Element Plus 全局导入 — 供问卷渲染引擎使用（引擎内 el-* 组件依赖此全局注册）
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import ArcoVue from "@arco-design/web-vue";
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
// vue-i18n — 问卷引擎组件（Cascader / DateTime / Transfer 等）内部使用 useI18n
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import { createAppRouter, type AppRouter } from "./router";

// 最小化 i18n 实例（问卷引擎仅需少量 UI 文案）
const i18n = createI18n({
  legacy: false,
  locale: "zh-CN",
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": {},
    "en-US": {},
    "ja-JP": {}
  }
});

// qiankun 环境下的当前 Vue 应用实例（支持重复挂载/卸载）
let instance: App<Element> | null = null;

// 导出 router 实例，供组件使用（解决多实例问题）
let appRouter: AppRouter | null = null;

/**
 * 创建并挂载 frontend 子应用
 *
 * @param container  qiankun 提供的挂载容器（独立运行时为 undefined）
 * @param routerBase 路由基路径（qiankun 场景 '/admin'，独立运行 '/'）
 */
function render(container?: Element | null, routerBase = "/") {
  appRouter = createAppRouter(routerBase);
  // 每次挂载创建新的 Pinia 实例，确保 qiankun 沙箱内状态隔离
  const pinia = createPinia();

  instance = createApp(App);
  instance.use(ArcoVue, { componentPrefix: "arco" });
  instance.use(ArcoVueIcon);
  instance.use(ElementPlus);
  instance.use(i18n);
  instance.use(pinia);
  instance.use(appRouter);

  // qiankun 场景：挂载到子容器内的 #app；独立运行：直接挂载 '#app'
  const mountTarget = container ? container.querySelector("#app") : "#app";
  instance.mount(mountTarget as string | Element);
}

// 导出 getCurrentRouter 函数供组件使用
export function getCurrentRouter(): AppRouter | null {
  return appRouter;
}

// ── qiankun 生命周期注册 ──────────────────────────────────────
// renderWithQiankun 将生命周期以 IIFE 方式注册到 window（由 vite-plugin-qiankun 桥接），
// 解决 qiankun eval() 无法访问 ES Module export 的根本问题
renderWithQiankun({
  mount(props) {
    console.log("[frontend] mount", props);
    render(props.container as Element | null, (props.routerBase as string) || "/admin");
  },
  bootstrap() {
    console.log("[frontend] bootstrap");
  },
  unmount() {
    console.log("[frontend] unmount");
    instance?.unmount();
    instance = null;
  },
  update() {}
});

// 独立运行（非 qiankun 环境）
if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render();
}
