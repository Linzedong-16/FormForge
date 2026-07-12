/**
 * 全局路由守卫 —— 纯函数拆分，便于单元测试
 *
 * 不依赖 Pinia/DOM，只接收当前用户的登录/角色状态与目标路由，返回：
 *  - true      → 放行
 *  - string    → 应重定向到的路径
 */
import type { RouteLocationNormalized } from "vue-router";

export interface GuardUserState {
  isLoggedIn: boolean;
  isSuperAdmin: boolean;
}

export function resolveNavigation(to: RouteLocationNormalized, user: GuardUserState): true | string {
  // 登录页：已登录则重定向到首页，否则放行
  if (to.path === "/login") {
    return user.isLoggedIn ? "/" : true;
  }

  // 未登录 → 跳转登录页
  if (!user.isLoggedIn) {
    return "/login";
  }

  // 仅 super_admin 可访问的路由 → 非管理员提前拦截，避免任何数据的哪怕短暂闪现
  if (to.meta?.requiresSuperAdmin && !user.isSuperAdmin) {
    return "/";
  }

  return true;
}
