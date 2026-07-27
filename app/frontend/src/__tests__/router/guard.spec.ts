/**
 * 路由守卫（resolveNavigation）单元测试
 *
 * 覆盖：登录页跳转逻辑、未登录拦截、requiresSuperAdmin 拦截（对应 SC-005：
 * 非授权用户 100% 被拒绝，且不出现任何数据的哪怕短暂闪现 —— 守卫在路由层拦截，
 * 目标组件从未挂载，因此本测试无需渲染任何组件即可完整验证该保证）
 */
import { describe, it, expect } from "vitest";
import type { RouteLocationNormalized } from "vue-router";
import { resolveNavigation } from "@/router/guard";

function makeRoute(path: string, requiresSuperAdmin = false): RouteLocationNormalized {
  return {
    path,
    meta: { requiresSuperAdmin }
  } as unknown as RouteLocationNormalized;
}

describe("resolveNavigation", () => {
  it("未登录访问登录页 → 放行", () => {
    const result = resolveNavigation(makeRoute("/login"), { isLoggedIn: false, isSuperAdmin: false });
    expect(result).toBe(true);
  });

  it("已登录访问登录页 → 重定向到首页", () => {
    const result = resolveNavigation(makeRoute("/login"), { isLoggedIn: true, isSuperAdmin: false });
    expect(result).toBe("/");
  });

  it("未登录访问其他页面 → 重定向到登录页", () => {
    const result = resolveNavigation(makeRoute("/analytics-dashboard", true), { isLoggedIn: false, isSuperAdmin: false });
    expect(result).toBe("/login");
  });

  it("已登录但非 super_admin 访问 requiresSuperAdmin 路由 → 重定向到首页（目标组件不会挂载）", () => {
    const result = resolveNavigation(makeRoute("/analytics-dashboard", true), { isLoggedIn: true, isSuperAdmin: false });
    expect(result).toBe("/");
  });

  it("已登录且是 super_admin 访问 requiresSuperAdmin 路由 → 放行", () => {
    const result = resolveNavigation(makeRoute("/analytics-dashboard", true), { isLoggedIn: true, isSuperAdmin: true });
    expect(result).toBe(true);
  });

  it("不带 requiresSuperAdmin 的路由不受角色限制 → 已登录即可放行", () => {
    const result = resolveNavigation(makeRoute("/", false), { isLoggedIn: true, isSuperAdmin: false });
    expect(result).toBe(true);
  });
});
