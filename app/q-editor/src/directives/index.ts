/**
 * 自定义指令统一导出/注册入口
 *
 * 当前包含：
 *   - v-permiss：权限控制指令（控制元素显隐）
 *
 * 使用方式：
 *   import { registerDirectives } from "@/directives";
 *   registerDirectives(app);
 */
import type { App } from "vue";
import { vPermiss } from "./permiss";

/**
 * 向 Vue 应用实例注册所有自定义指令
 *
 * 指令命名规则：
 *   - 命名空间 "permiss" 与 Element Plus 的 "permission" 明确区分
 *   - 避免与第三方库指令冲突
 *
 * @param app Vue 应用实例
 */
export function registerDirectives(app: App): void {
  app.directive("permiss", vPermiss);
}

// 按需导出，支持外部直接引用
export { vPermiss } from "./permiss";
export type { PermissRole, PermissValue } from "./permiss";
