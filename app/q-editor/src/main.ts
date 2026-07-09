import "./public-path";
import { createApp } from "vue";
import { createPinia } from "pinia";
import { renderWithQiankun, qiankunWindow } from "vite-plugin-qiankun/es/helper";

import App from "./App.vue";
import { createAppRouter } from "./router";

// 自定义指令
import { registerDirectives } from "@/directives";

// 埋点监控接入
import { installTracking, flushTracking } from "@/plugins/tracking";

// elementplus 组件库
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";

// pinia 持久化插件
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";

// i18n 国际化
import { setupI18n } from "@/i18n";

// scss 样式
import "@/assets/css/index.scss";

// Font Awesome 配置
import { library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { fas } from "@fortawesome/free-solid-svg-icons";

library.add(fas);

// qiankun 环境下的当前 Vue 应用实例（支持重复挂载/卸载）
let instance: ReturnType<typeof createApp> | null = null;

/**
 * 创建并挂载 q-editor 子应用
 *
 * @param container  qiankun 提供的挂载容器（独立运行时为 undefined）
 * @param routerBase 路由基路径（qiankun 场景 '/editor'，独立运行 '/'）
 */
function render(container?: Element | null, routerBase = "/") {
  const router = createAppRouter(routerBase);
  const pinia = createPinia().use(piniaPluginPersistedstate);

  instance = createApp(App);
  instance.component("FontAwesomeIcon", FontAwesomeIcon);
  // 先安装 i18n，确保在 Pinia store 初始化前可用
  setupI18n(instance);
  instance.use(pinia);
  instance.use(router);
  // Element Plus 语言由 App.vue 的 ElConfigProvider 跟随 i18n 动态切换
  instance.use(ElementPlus);

  // 注册自定义指令（v-permiss 等）
  registerDirectives(instance);

  // 接入埋点监控：错误采集 + 按路由自动上报 PV + 自定义性能计时
  // standalone 与 qiankun 场景走同一逻辑，保证埋点行为一致（对齐 FR-004）
  installTracking(instance, router);

  // qiankun 场景：挂载到子容器内的 #app；独立运行：直接挂载 '#app'
  const mountTarget = container ? container.querySelector("#app") : "#app";
  instance.mount(mountTarget as string | Element);
}

// ── qiankun 生命周期注册 ──────────────────────────────────────
// renderWithQiankun 将生命周期以 IIFE 方式注册到 window（由 vite-plugin-qiankun 桥接），
// 解决 qiankun eval() 无法访问 ES Module export 的根本问题
renderWithQiankun({
  mount(props) {
    console.log("[q-editor] mount", props);
    render(props.container as Element | null, (props.routerBase as string) || "/editor");
  },
  bootstrap() {
    console.log("[q-editor] bootstrap");
  },
  unmount() {
    console.log("[q-editor] unmount");
    // 卸载前尽力冲刷埋点缓冲队列，避免子应用被卸载后事件丢失
    flushTracking().finally(() => {
      instance?.unmount();
      instance = null;
    });
  },
  update() {}
});

// 独立运行（非 qiankun 环境）
if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render();
}
