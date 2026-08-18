# 契约：ComponentFactory（组件工厂注册/查找接口）

**范围**：`packages/survey-engine/src/core/factory/index.ts`（框架无关契约）+ `packages/survey-engine/src/adapters/vue3/componentFactory.ts`（Vue3 实现）。这是本次改造中唯一需要跨越"核心 ⇄ 适配层"边界的公开接口，因此单独列出契约文档。

## 核心契约（框架无关）

```ts
/**
 * 组件工厂：按字符串标识维护"题型/字段编辑器名 → 该渲染框架下的组件"映射。
 * TComponent 由具体适配层决定（Vue3 适配层中为 VueComType，未来 React 适配层中可为 React.ComponentType）。
 */
export interface ComponentFactory<TComponent> {
  /**
   * 注册一个组件。重复调用同一 name 视为覆盖注册（用于测试替身场景），不抛异常。
   */
  register(name: string, component: TComponent): void;

  /**
   * 按字符串标识查找组件。找不到时返回 undefined，不抛异常——
   * 由调用方（渲染层）决定如何降级（FR-008），工厂本身不承担降级职责。
   */
  resolve(name: string): TComponent | undefined;

  /**
   * 判断某个标识是否已注册，供调用方在渲染前做存在性检查。
   */
  has(name: string): boolean;
}

export function createComponentFactory<TComponent>(): ComponentFactory<TComponent>;
```

**契约约束**：

- `core/factory/index.ts` 本身不得 import 任何具体渲染框架的类型或运行时代码（否则失去存在意义）。
- `register`/`resolve`/`has` 均为同步方法，不涉及异步加载（现有 `componentMap` 是同步 import 的静态映射表，不改变这一前提）。
- 未注册即调用 `resolve` 不抛异常、返回 `undefined`——这是允许渲染层做优雅降级（FR-008）的前提，工厂契约层不得抛异常中断渲染流程。

## Vue3 适配层实现

```ts
// adapters/vue3/componentFactory.ts
import { markRaw } from "vue";
import type { VueComType } from "../../types/common";
import { createComponentFactory } from "../../core/factory";

export const vue3ComponentFactory = createComponentFactory<VueComType>();

// 模块加载时一次性注册现有 componentMap 全部条目（业务组件 + 编辑组件）
// 具体注册代码在 adapters/vue3/componentMap.ts 中执行，此处仅声明工厂实例本身

export function resolveVue3Component(name: string): VueComType | undefined {
  return vue3ComponentFactory.resolve(name);
}

export function registerVue3Component(name: string, component: VueComType): void {
  vue3ComponentFactory.register(name, markRaw(component));
}
```

**契约约束**：

- `markRaw()` 的调用职责在适配层内部完成（`registerVue3Component` 内），核心契约的 `register()` 方法本身不感知 `markRaw`。
- `resolveVue3Component`/`registerVue3Component` 是本次改造后 `restoreComponentStatus.ts`、`SurveyPreviewDetail.vue` 等消费方应当调用的公开入口，取代现状直接从 `componentMap` 对象按 key 取值的用法。

## 消费方调用示例（契约级，非完整实现）

```ts
// 渲染层降级处理示例（对应 FR-008）
const component = resolveVue3Component(schemaComponent.name);
if (!component) {
  console.warn(`[survey-engine] 未知题型标识: ${schemaComponent.name}，跳过渲染该题`);
  // 渲染层自行决定：跳过该题 / 渲染占位提示组件，工厂契约不介入这一决策
}
```

## 验证方式（对应 User Story 2 Independent Test）

1. 在不安装 `vue` 依赖的 Node 环境下，仅 `import { createComponentFactory } from "core/factory"`，用一个假的字符串占位符（如 `"fake-component"`）调用 `register`/`resolve`/`has`，验证行为符合契约，且该测试文件不产生任何对 `vue` 的模块解析请求。
2. 在装有 `vue` 的环境下，`vue3ComponentFactory.resolve("single-select")` 应返回与现有 `componentMap["single-select"]` 相同（`markRaw` 包裹后）的组件引用，验证迁移前后行为一致。
