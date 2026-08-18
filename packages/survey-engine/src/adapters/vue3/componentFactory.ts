// adapters/vue3/componentFactory.ts —— core/factory 的 Vue3 具体实现（contracts/component-factory.md）。
// markRaw() 的调用职责封装在本文件内部，核心契约的 register()/resolve() 本身不感知 Vue。
import { markRaw } from "vue";
import type { VueComType } from "../../types/common";
import { createComponentFactory } from "../../core/factory";

export const vue3ComponentFactory = createComponentFactory<VueComType>();

// 按字符串标识查找 Vue3 组件；找不到时返回 undefined，降级处理交由调用方（FR-008）
export function resolveVue3Component(name: string): VueComType | undefined {
  return vue3ComponentFactory.resolve(name);
}

// 注册一个 Vue3 组件；markRaw 避免组件对象被 Vue 响应式系统代理
export function registerVue3Component(name: string, component: VueComType): void {
  vue3ComponentFactory.register(name, markRaw(component));
}
