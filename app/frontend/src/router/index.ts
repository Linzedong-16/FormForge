import { createRouter, createWebHistory } from "vue-router";
import LayoutPage from "@/views/layout/layout-page.vue";
import { childrenRoutes } from "./routes";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
      path: "/:pathMatch(.*)*",
      component: () => import("@/views/NotFound/NotFoundView.vue")
    }
  ]
});

export default router;
