// 框架无关的组件工厂契约（contracts/component-factory.md）。
// 核心包只关心"字符串标识 → 组件"的注册/查找关系，具体 TComponent 是什么类型
// （Vue3 组件、未来的 React 组件、测试替身对象）完全由适配层决定，本文件不得出现任何框架 import。

/**
 * 组件工厂：按字符串标识维护"题型/字段编辑器名 → 该渲染框架下的组件"映射。
 */
export interface ComponentFactory<TComponent> {
  /** 注册一个组件。重复调用同一 name 视为覆盖注册（用于测试替身场景），不抛异常。 */
  register(name: string, component: TComponent): void;
  /** 按字符串标识查找组件。找不到时返回 undefined，不抛异常——降级处理职责交给调用方（FR-008）。 */
  resolve(name: string): TComponent | undefined;
  /** 判断某个标识是否已注册，供调用方在渲染前做存在性检查。 */
  has(name: string): boolean;
}

export function createComponentFactory<TComponent>(): ComponentFactory<TComponent> {
  const registry = new Map<string, TComponent>();

  return {
    register(name, component) {
      registry.set(name, component);
    },
    resolve(name) {
      return registry.get(name);
    },
    has(name) {
      return registry.has(name);
    }
  };
}
