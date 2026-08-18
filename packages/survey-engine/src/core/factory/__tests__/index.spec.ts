// core/factory/index.spec.ts —— ComponentFactory 契约单测（T018，quickstart.md 场景 3 步骤 3）。
// 使用测试替身对象（非 Vue 组件）验证 register/resolve/has 行为，
// 证明 createComponentFactory 对 TComponent 的具体类型不作任何假设，可脱离 Vue 独立运行。
import { describe, it, expect } from "vitest";
import { createComponentFactory } from "../index";

// 测试替身：任意非 Vue 组件形态的普通对象，仅用于占位验证工厂的存取行为
interface FakeComponent {
  id: string;
}

describe("createComponentFactory", () => {
  it("register 后可通过 resolve 取回同一引用", () => {
    const factory = createComponentFactory<FakeComponent>();
    const fake: FakeComponent = { id: "fake-single-select" };

    factory.register("single-select", fake);

    expect(factory.resolve("single-select")).toBe(fake);
  });

  it("resolve 未注册的标识返回 undefined，不抛异常", () => {
    const factory = createComponentFactory<FakeComponent>();

    expect(factory.resolve("unknown-type")).toBeUndefined();
  });

  it("has 能正确反映已注册/未注册状态", () => {
    const factory = createComponentFactory<FakeComponent>();
    factory.register("multi-select", { id: "fake-multi-select" });

    expect(factory.has("multi-select")).toBe(true);
    expect(factory.has("not-registered")).toBe(false);
  });

  it("重复 register 同一 name 视为覆盖注册", () => {
    const factory = createComponentFactory<FakeComponent>();
    const first: FakeComponent = { id: "first" };
    const second: FakeComponent = { id: "second" };

    factory.register("text-input", first);
    factory.register("text-input", second);

    expect(factory.resolve("text-input")).toBe(second);
  });
});
