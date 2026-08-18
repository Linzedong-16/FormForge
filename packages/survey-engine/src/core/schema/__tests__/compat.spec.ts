// 契约：core/schema/compat.ts —— 旧格式题目数据的检测与转换（contracts/schema-validation.md）
// 对应 quickstart.md 场景 2、research.md R4：
//   - isLegacyComponent 检测规则：type 存在且非 string / status[*] 含 editCom / schemaVersion !== 2
//   - toSchemaComponent 剥离运行时引用属性，补齐 schemaVersion: 2，其余字段原样保留
import { describe, expect, it } from "vitest";
import { isLegacyComponent, toSchemaComponent } from "../compat";

// 模拟组件运行时引用（现状 Status.type / BaseProps.editCom 实际挂载的对象），
// 测试中只需一个"不是 string"的占位值即可触发检测规则，无需真实 Vue 组件
const fakeComponentRef = { __isFakeVueComponent: true };

describe("isLegacyComponent", () => {
  it("存在 type 属性且非 string 时判定为旧格式", () => {
    const legacy = {
      type: fakeComponentRef,
      id: "q1",
      name: "text-input",
      status: {}
    };
    expect(isLegacyComponent(legacy)).toBe(true);
  });

  it("status 中任一字段配置存在 editCom 属性时判定为旧格式", () => {
    const legacy = {
      id: "q2",
      name: "text-input",
      status: {
        title: {
          id: "title",
          isShow: true,
          name: "title",
          editCom: fakeComponentRef
        }
      }
    };
    expect(isLegacyComponent(legacy)).toBe(true);
  });

  it("缺少 schemaVersion 字段时判定为旧格式", () => {
    const legacy = {
      id: "q3",
      name: "text-input",
      status: {}
    };
    expect(isLegacyComponent(legacy)).toBe(true);
  });

  it("schemaVersion 为 2 且无组件引用属性时判定为新格式", () => {
    const modern = {
      schemaVersion: 2,
      id: "q4",
      name: "text-input",
      status: {
        title: {
          id: "title",
          isShow: true,
          name: "title",
          editComName: "title-editor"
        }
      }
    };
    expect(isLegacyComponent(modern)).toBe(false);
  });
});

describe("toSchemaComponent", () => {
  it("剥离 type/editCom 等运行时引用属性，补齐 schemaVersion: 2，其余字段原样保留", () => {
    const legacy = {
      type: fakeComponentRef,
      id: "q1",
      name: "text-input",
      clientKey: "ck-1",
      status: {
        title: {
          id: "title",
          isShow: true,
          name: "title",
          editCom: fakeComponentRef,
          status: "标题文案"
        }
      }
    };

    const result = toSchemaComponent(legacy as never);

    expect(result.schemaVersion).toBe(2);
    expect(result).not.toHaveProperty("type");
    expect(result.id).toBe("q1");
    expect(result.name).toBe("text-input");
    expect(result.clientKey).toBe("ck-1");
    expect(result.status.title).not.toHaveProperty("editCom");
    expect(result.status.title.status).toBe("标题文案");
    // 转换结果必须能被无损序列化（不含 function/组件引用）
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toContain("__isFakeVueComponent");
  });

  it("对已经是新格式的数据转换结果与输入结构等价（幂等）", () => {
    const modern = {
      schemaVersion: 2 as const,
      id: "q4",
      name: "text-input" as const,
      status: {
        title: {
          id: "title",
          isShow: true,
          name: "title",
          editComName: "title-editor" as const,
          status: "标题文案"
        }
      }
    };

    const result = toSchemaComponent(modern);

    expect(result).toEqual(modern);
  });
});
