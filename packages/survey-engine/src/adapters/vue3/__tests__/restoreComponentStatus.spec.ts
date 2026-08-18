// restoreComponentStatus 单元测试（T014，从 src/__tests__/utils.spec.ts 迁移而来）
// 覆盖：顶层 type 引用还原、字段级 editCom 引用还原（旧格式 name 字段承载编辑器标识）、无 status 时的安全处理、
// 未知题型标识的降级处理（T017，FR-008，quickstart.md 场景 5）
import { describe, it, expect, vi } from "vitest";
import { restoreComponentStatus } from "../restoreComponentStatus";
// 副作用导入：模块加载时向 vue3ComponentFactory 注册现有全部 componentMap 条目
import "../componentMap";
import type { Status, Material } from "../../../types";

describe("restoreComponentStatus", () => {
  it("恢复 name 对应的 Vue 组件引用 type", () => {
    const coms: Status[] = [
      {
        name: "single-select" as Material,
        id: "a",
        type: undefined as never,
        status: {
          title: {
            id: "t1",
            isShow: true,
            name: "title",
            editCom: undefined as never,
            status: "标题"
          }
        }
      }
    ];
    restoreComponentStatus(coms);
    // type 被组件工厂恢复（single-select 已在 componentMap 中注册）
    expect(coms[0]!.type).toBeDefined();
  });

  it("编辑组件 editCom 也被恢复（旧格式 name 字段承载编辑器标识）", () => {
    const coms: Status[] = [
      {
        name: "single-select" as Material,
        id: "a",
        type: undefined as never,
        status: {
          title: {
            id: "t1",
            isShow: true,
            name: "title-editor",
            editCom: undefined as never,
            status: "标题"
          }
        }
      }
    ];
    restoreComponentStatus(coms);
    expect(coms[0]!.status.title!.editCom).toBeDefined();
  });

  it("安全处理无 status 的情况", () => {
    expect(() =>
      restoreComponentStatus([{ name: "single-select" as Material, id: "a", type: undefined as never, status: {} }])
    ).not.toThrow();
  });

  it("未知题型标识：跳过该题渲染并记录告警（FR-008）", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const coms: Status[] = [
      { name: "unknown-type-x" as Material, id: "a", type: undefined as never, status: {} }
    ];

    restoreComponentStatus(coms);

    // 查找失败时 type 保持 undefined，渲染层 <component :is="undefined"> 天然跳过该题
    expect(coms[0]!.type).toBeUndefined();
    // 告警内容需包含未知标识本身，便于排查
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unknown-type-x"));

    warnSpy.mockRestore();
  });
});
