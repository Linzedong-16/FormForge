import { createRouter, createWebHistory, type Router } from "vue-router";
import LayoutPage from "@/views/layout/layout-page.vue";
import { childrenRoutes } from "./routes";

// 导出 AppRouter 类型供其他模块使用
export type AppRouter = Router;

/**
 * 路由工厂函数
 *
 * 支持 qiankun 微前端场景动态设置路由基路径：
 *   - 独立运行：base = '/'
 *   - 作为 qiankun 子应用运行（activeRule '/admin'）：base = '/admin'
 *
 * @param base 路由基路径，由 main.ts 从 qiankun props.routerBase 注入
 */
export function createAppRouter(base = "/"): Router {
  return createRouter({
    history: createWebHistory(base),
    routes: [
      {
        path: "/",
        component: LayoutPage,
        children: childrenRoutes
      },
      {
        path: "/login",
        name: "login",
        component: () => import("@/views/login/LoginView.vue")
      },
      {
        // 问卷审核详情（独立路由，新标签页打开，无 Layout 包裹）
        path: "/survey-management/audit/:id",
        name: "surveyPreviewDetail",
        component: () => import("@/views/survey-preview/detail/SurveyPreviewDetail.vue")
      },
      {
        path: "/:pathMatch(.*)*",
        component: () => import("@/views/NotFound/NotFoundView.vue")
      }
    ]
  });
}

// 独立运行时使用默认路由实例（保持向后兼容）
export default createAppRouter("/");
