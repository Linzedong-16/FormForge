/**
 * v-permiss — 自定义权限指令
 *
 * 职责：
 *  - 根据用户身份（admin / super_admin / user）控制 DOM 元素的显示状态
 *  - 与 Element Plus 的权限指令完全独立，命名空间无冲突
 *
 * 使用方式：
 *   <el-button v-permiss="'admin'">管理员可见</el-button>
 *   <el-button v-permiss="'super_admin'">超管可见</el-button>
 *
 * 未来扩展（数组模式，权限列表匹配）：
 *   <el-button v-permiss="['survey:create', 'survey:delete']">有权限可见</el-button>
 *
 * 安全提醒：
 *   前端权限控制仅为 UX 优化，不可替代后端权限校验。
 */

import type { Directive, DirectiveBinding } from "vue";
import { useUserStore } from "@/stores/useUser";

// ─── 类型定义 ────────────────────────────────────────────────

/**
 * 基础角色类型（严格对齐 @common/user/user.interface.ts 中 UserInfo.role）
 *
 * - super_admin: 超级管理员，拥有系统全部权限
 * - admin:       普通管理员
 * - user:        普通用户
 */
export type PermissRole = "super_admin" | "admin" | "user";

/**
 * 指令参数类型
 *
 * - string: 直接比对用户角色
 * - string[]: 比对权限列表（预留，待后续权限列表功能开发后启用）
 */
export type PermissValue = PermissRole | PermissRole[];

// ─── 权限校验核心 ────────────────────────────────────────────

/**
 * 检查当前用户是否拥有指定权限
 *
 * @param value  指令绑定值（角色字符串 或 角色列表）
 * @returns      是否拥有权限
 */
function checkPermission(value: PermissValue): boolean {
  const userStore = useUserStore();
  const userRole = userStore.user?.role as PermissRole | undefined;

  // 未登录或无用户信息 → 无权限
  if (!userRole || !userStore.isLoggedIn) {
    return false;
  }

  // ─── 字符串模式：直接比对用户角色 ──────────────────────────
  if (typeof value === "string") {
    return hasRole(userRole, value);
  }

  // ─── 数组模式：权限列表匹配（预留） ────────────────────────
  // 待权限列表功能开发完成后扩展实现
  if (Array.isArray(value)) {
    // TODO: 接入权限列表模块后实现列表匹配逻辑
    return value.some(role => hasRole(userRole, role));
  }

  return false;
}

/**
 * 判断用户角色是否满足目标角色要求
 *
 * 角色层级：super_admin > admin > user
 * 上级角色自动继承下级权限
 */
function hasRole(userRole: PermissRole, targetRole: PermissRole): boolean {
  // 角色层级映射（数值越大权限越高）
  const ROLE_HIERARCHY: Record<PermissRole, number> = {
    user: 0,
    admin: 1,
    super_admin: 2
  };

  const userLevel = ROLE_HIERARCHY[userRole] ?? -1;
  const targetLevel = ROLE_HIERARCHY[targetRole] ?? -1;

  return userLevel >= targetLevel;
}

// ─── 指令实现 ────────────────────────────────────────────────

/**
 * 获取元素的原始 display 属性
 *
 * 用于在权限变更时恢复元素显示状态，而非简单设置为 block
 */
const ORIGINAL_DISPLAY = new WeakMap<HTMLElement, string>();

function storeOriginalDisplay(el: HTMLElement) {
  if (!ORIGINAL_DISPLAY.has(el)) {
    ORIGINAL_DISPLAY.set(el, el.style.display || "");
  }
}

function hideElement(el: HTMLElement) {
  el.style.display = "none";
}

function showElement(el: HTMLElement) {
  const original = ORIGINAL_DISPLAY.get(el);
  el.style.display = original && original !== "none" ? original : "";
}

/**
 * 统一的权限处理逻辑
 *
 * 在 mounted / updated 钩子中复用，保持行为一致
 */
function applyPermission(el: HTMLElement, binding: DirectiveBinding<PermissValue>) {
  // 无绑定值 → 不做任何处理（不隐藏也不报错）
  if (binding.value === undefined || binding.value === null) {
    return;
  }

  storeOriginalDisplay(el);

  const allowed = checkPermission(binding.value);

  if (allowed) {
    showElement(el);
  } else {
    hideElement(el);
  }
}

// ─── 指令导出 ────────────────────────────────────────────────

export const vPermiss: Directive<HTMLElement, PermissValue> = {
  /**
   * 元素挂载到 DOM 时调用
   *
   * 在此阶段执行初始权限判断并控制元素显示/隐藏
   */
  mounted(el, binding) {
    applyPermission(el, binding);
  },

  /**
   * 绑定值变化时调用
   *
   * 当用户角色变化或权限参数更新时，重新执行权限判断
   */
  updated(el, binding) {
    applyPermission(el, binding);
  }
};

export default vPermiss;
