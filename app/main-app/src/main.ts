import { createApp } from "vue";
import { createPinia } from "pinia";
import { registerMicroApps, start } from "qiankun";
import App from "./App.vue";
import router from "./router";
import "./style/main.css";

// ── 初始化主应用 ──────────────────────────────────────────────
const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");

// ── 注册 qiankun 子应用 ───────────────────────────────────────
registerMicroApps(
  [
    {
      // 问卷低代码编辑器（Element Plus + 复杂路由）
      name: "q-editor",
      entry: "//localhost:5173", // q-editor 开发服务器
      container: "#subapp-container",
      activeRule: "/editor",
      props: {
        routerBase: "/editor" // 子应用路由基路径
      }
    },
    {
      // 管理后台系统（Arco Design + 数据统计）
      name: "frontend",
      entry: "//localhost:5174", // frontend 开发服务器
      container: "#subapp-container",
      activeRule: "/admin",
      props: {
        routerBase: "/admin"
      }
    }
  ],
  {
    // 生命周期日志（开发阶段保留）
    beforeLoad: [
      app => {
        console.log(`[qiankun] 开始加载子应用：${app.name}`);
        return Promise.resolve();
      }
    ],
    beforeMount: [
      app => {
        console.log(`[qiankun] 挂载子应用：${app.name}`);
        return Promise.resolve();
      }
    ],
    afterUnmount: [
      app => {
        console.log(`[qiankun] 卸载子应用：${app.name}`);
        return Promise.resolve();
      }
    ]
  }
);

// ── 启动 qiankun ──────────────────────────────────────────────
start({
  sandbox: {
    // 关闭 Shadow DOM 严格隔离（避免 Element Plus / Arco Design 样式失效）
    strictStyleIsolation: false,
    // 开启 scoped CSS 隔离（为子应用 CSS 添加唯一属性选择器）
    experimentalStyleIsolation: true
  },
  // 开发阶段关闭预加载，避免并发加载干扰
  prefetch: false
});
