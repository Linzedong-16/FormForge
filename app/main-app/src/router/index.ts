import { createRouter, createWebHistory } from "vue-router";

// 主应用路由：只负责主应用自身的顶层页面路由
// 子应用的内部路由由各自的 Vue Router 实例管理
const router = createRouter({
  history: createWebHistory("/"),
  routes: [
    {
      // 根路径：重定向至管理后台（可按业务需求调整默认落地页）
      path: "/",
      redirect: "/admin"
    },
    {
      // /editor/* 路由：交由 qiankun activeRule 拦截，挂载 q-editor 子应用
      // 此处仅配置空组件占位，避免 Vue Router 警告
      path: "/editor",
      name: "editor",
      component: { template: "<div></div>" }
    },
    {
      // /admin/* 路由：交由 qiankun activeRule 拦截，挂载 frontend 子应用
      path: "/admin",
      name: "admin",
      component: { template: "<div></div>" }
    },
    {
      // 兜底 404
      path: "/:pathMatch(.*)*",
      name: "not-found",
      redirect: "/"
    }
  ]
});

export default router;
