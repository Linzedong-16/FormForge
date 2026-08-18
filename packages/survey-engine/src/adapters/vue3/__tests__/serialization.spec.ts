// 契约：新 Schema 的"序列化 → 反序列化 → 渲染一致"验收（quickstart.md 场景 1，对应 SC-002/FR-002）
// 断言：LowCodeSchema 经 JSON.stringify/JSON.parse 后无需任何"引用还原"步骤，
// 即可通过 resolveVue3Component 按字符串标识查表得到与迁移前相同的组件引用
import { describe, expect, it } from "vitest";
import SingleSelect from "../../../components/SurveyComs/Materials/SelectComs/SingleSelect.vue";
import TextInput from "../../../components/SurveyComs/Materials/InputComs/TextInput.vue";
import TitleEditor from "../../../components/SurveyComs/EditItems/TitleEditor.vue";
import { resolveVue3Component } from "../componentFactory";
// 副作用导入：模块加载时向 vue3ComponentFactory 注册现有全部 componentMap 条目
import "../componentMap";
import type { LowCodeSchema } from "../../../core/schema/types";

function buildSchema(): LowCodeSchema {
  return {
    schemaVersion: 2,
    components: [
      {
        name: "text-input",
        id: "q1",
        clientKey: "ck-1",
        status: {
          title: {
            id: "title",
            isShow: true,
            name: "title",
            editComName: "title-editor",
            status: "请输入你的姓名"
          }
        }
      },
      {
        name: "single-select",
        id: "q2",
        clientKey: "ck-2",
        status: {
          title: {
            id: "title",
            isShow: true,
            name: "title",
            editComName: "title-editor",
            status: "请选择性别"
          },
          options: {
            id: "options",
            isShow: true,
            name: "options",
            editComName: "options-editor",
            status: ["男", "女"],
            currentStatus: 0
          }
        }
      }
    ]
  };
}

describe("Schema 序列化/反序列化后渲染一致", () => {
  it("JSON.stringify 产物不含任何 function/组件引用", () => {
    const schema = buildSchema();

    const serialized = JSON.stringify(schema);

    expect(serialized).not.toContain("function");
    // 反序列化结果与原始 Schema 结构完全一致（不存在丢失/被序列化为 {} 的组件引用属性）
    expect(JSON.parse(serialized)).toEqual(schema);
  });

  it("不经任何引用还原步骤，直接按 name/editComName 查表即可得到与原有 componentMap 一致的组件引用", () => {
    const schema = buildSchema();
    const restored: LowCodeSchema = JSON.parse(JSON.stringify(schema));

    for (const component of restored.components) {
      const resolved = resolveVue3Component(component.name);
      expect(resolved).toBeDefined();

      for (const field of Object.values(component.status)) {
        const resolvedEditor = resolveVue3Component(field.editComName);
        expect(resolvedEditor).toBeDefined();
      }
    }

    // 与直接从源文件导入的组件引用完全一致（markRaw 包裹后仍是同一对象引用）
    expect(resolveVue3Component("text-input")).toBe(TextInput);
    expect(resolveVue3Component("single-select")).toBe(SingleSelect);
    expect(resolveVue3Component("title-editor")).toBe(TitleEditor);
  });
});
