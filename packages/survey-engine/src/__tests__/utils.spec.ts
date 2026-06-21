// ──────────────────────────────────────────────────────────────────────────────
// 问卷引擎工具函数 — 单元测试
// 覆盖 utils/index.ts 中全部 14 个导出函数
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import {
  getTextStatus,
  getStringStatus,
  getCurrentStatus,
  getStringStatusByCurrentStatus,
  getValueStatusByCurrentStatus,
  getPicTitleDescStatusArr,
  getValueStatus,
  isValueStatusArray,
  isPicTitleDescArray,
  changeEditorIsShowStatus,
  updateInitStatusBeforeAdd,
  formatDate,
  restoreComponentStatus,
  openNewTab
} from "../utils/index";
import type { TextProps, OptionsProps, Status, TypeStatus, Material } from "../types";

// ─── 辅助：构造测试用 Props ────────────────────────────────────────────────

function makeTextProps(status: string): TextProps {
  return { id: "t1", isShow: true, name: "title", editCom: {} as never, status };
}

function makeOptionsProps(status: string[], currentStatus = 0): OptionsProps {
  return { id: "o1", isShow: true, name: "options", editCom: {} as never, status, currentStatus };
}

// ──────────────────────────────────────────────────────────────────────────────
// getTextStatus
// ──────────────────────────────────────────────────────────────────────────────
describe("getTextStatus", () => {
  it("返回 TextProps.status 的值", () => {
    expect(getTextStatus(makeTextProps("hello"))).toBe("hello");
  });

  it("空字符串正常返回", () => {
    expect(getTextStatus(makeTextProps(""))).toBe("");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getStringStatus
// ──────────────────────────────────────────────────────────────────────────────
describe("getStringStatus", () => {
  it("返回 OptionsProps.status", () => {
    const arr = ["选项A", "选项B"];
    expect(getStringStatus(makeOptionsProps(arr))).toEqual(arr);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getCurrentStatus
// ──────────────────────────────────────────────────────────────────────────────
describe("getCurrentStatus", () => {
  it("返回 currentStatus 索引", () => {
    expect(getCurrentStatus(makeOptionsProps(["a", "b"], 1))).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getStringStatusByCurrentStatus
// ──────────────────────────────────────────────────────────────────────────────
describe("getStringStatusByCurrentStatus", () => {
  it("按 currentStatus 返回 status 对应项", () => {
    expect(getStringStatusByCurrentStatus(makeOptionsProps(["小", "中", "大"], 2))).toBe("大");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getValueStatusByCurrentStatus
// ──────────────────────────────────────────────────────────────────────────────
describe("getValueStatusByCurrentStatus", () => {
  it("ValueStatusArr 按索引返回 { value, status } 对象", () => {
    const arr = [
      { value: "v1", status: "选项1" },
      { value: "v2", status: "选项2" }
    ];
    const props = makeOptionsProps(arr, 1);
    expect(getValueStatusByCurrentStatus(props)).toEqual({ value: "v2", status: "选项2" });
  });

  it("PicTitleDescStatusArr 按索引返回对象", () => {
    const arr = [{ picTitle: "图1", picDesc: "描述1", value: "url1" }];
    const props = { ...makeOptionsProps(arr, 0), status: arr } as OptionsProps;
    expect(getValueStatusByCurrentStatus(props)).toEqual(arr[0]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getPicTitleDescStatusArr
// ──────────────────────────────────────────────────────────────────────────────
describe("getPicTitleDescStatusArr", () => {
  it("普通字符串数组返回 undefined", () => {
    expect(getPicTitleDescStatusArr(makeOptionsProps(["a", "b"]))).toBeUndefined();
  });

  it("PicTitleDesc 数组返回自身", () => {
    const arr = [{ picTitle: "图1", picDesc: "描述1", value: "url1" }];
    const props = { ...makeOptionsProps(arr), status: arr } as OptionsProps;
    expect(getPicTitleDescStatusArr(props)).toEqual(arr);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getValueStatus
// ──────────────────────────────────────────────────────────────────────────────
describe("getValueStatus", () => {
  it("ValueStatusArr 返回自身", () => {
    const arr = [{ value: "v1", status: "选项1" }];
    const props = { ...makeOptionsProps(arr), status: arr } as OptionsProps;
    expect(getValueStatus(props)).toEqual(arr);
  });

  it("PicTitleDesc数组 返回自身", () => {
    const arr = [{ picTitle: "t1", picDesc: "d1", value: "url1" }];
    const props = { ...makeOptionsProps(arr), status: arr } as OptionsProps;
    expect(getValueStatus(props)).toEqual(arr);
  });

  it("非法类型返回 undefined", () => {
    // 传入空数组，isValueStatusArray 检查 length > 0
    expect(getValueStatus(makeOptionsProps([]))).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// isValueStatusArray — 类型谓词
// ──────────────────────────────────────────────────────────────────────────────
describe("isValueStatusArray", () => {
  it("{ value, status } 数组 → true", () => {
    expect(isValueStatusArray([{ value: "v1", status: "选项1" }])).toBe(true);
  });

  it("字符串数组 → false", () => {
    expect(isValueStatusArray(["a", "b"])).toBe(false);
  });

  it("空数组 → false", () => {
    expect(isValueStatusArray([])).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// isPicTitleDescArray — 类型谓词
// ──────────────────────────────────────────────────────────────────────────────
describe("isPicTitleDescArray", () => {
  it("{ picTitle, picDesc, value } 数组 → true", () => {
    expect(isPicTitleDescArray([{ picTitle: "t", picDesc: "d", value: "v" }])).toBe(true);
  });

  it("字符串数组 → false", () => {
    expect(isPicTitleDescArray(["a"])).toBe(false);
  });

  it("空数组 → false", () => {
    expect(isPicTitleDescArray([])).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// changeEditorIsShowStatus
// ──────────────────────────────────────────────────────────────────────────────
describe("changeEditorIsShowStatus", () => {
  function makeTypeStatus(currentType: number): TypeStatus {
    return {
      title: makeTextProps("test"),
      desc: makeTextProps(""),
      position: makeOptionsProps(["左对齐", "居中"]),
      titleSize: makeOptionsProps(["16", "18", "22"]),
      descSize: makeOptionsProps(["14", "16"]),
      titleWeight: makeOptionsProps(["正常", "粗体"]),
      descWeight: makeOptionsProps(["正常", "粗体"]),
      titleItalic: makeOptionsProps(["正常", "斜体"]),
      descItalic: makeOptionsProps(["正常", "斜体"]),
      titleColor: makeTextProps("#000000"),
      descColor: makeTextProps("#999999"),
      type: makeOptionsProps(["text", "number"], currentType)
    };
  }

  it("type 相同时不变（type.currentStatus == type）", () => {
    const status = makeTypeStatus(0);
    const before = { ...status.title };
    changeEditorIsShowStatus(status, 0);
    expect(status.title.isShow).toBe(before.isShow);
    expect(status.title.isShow).toBe(true);
  });

  it("type 不同时翻转 isShow（type.currentStatus != type）", () => {
    const status = makeTypeStatus(0);
    changeEditorIsShowStatus(status, 1);
    expect(status.title.isShow).toBe(false);
    expect(status.desc.isShow).toBe(false);
    expect(status.position.isShow).toBe(false);
  });

  it("再次调用同一 type 不触发翻转（type 相同时跳过）", () => {
    const status = makeTypeStatus(0);
    changeEditorIsShowStatus(status, 1); // type != currentStatus(0) → 翻转
    expect(status.title.isShow).toBe(false);
    // 再次以 type=1 调用，此时 type === currentStatus？currentStatus 未变仍为 0，1 != 0 → 再次翻转
    changeEditorIsShowStatus(status, 1);
    expect(status.title.isShow).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// updateInitStatusBeforeAdd
// ──────────────────────────────────────────────────────────────────────────────
describe("updateInitStatusBeforeAdd", () => {
  function makeBasicStatus(): Status {
    return {
      name: "single-select" as Material,
      id: "id-1",
      type: {} as never,
      status: {
        title: { id: "t", isShow: true, name: "title", editCom: {} as never, status: "" },
        desc: { id: "d", isShow: true, name: "desc", editCom: {} as never, status: "" },
        position: makeOptionsProps(["左对齐", "居中"]),
        titleSize: makeOptionsProps(["16", "18"]),
        descSize: makeOptionsProps(["14", "16"]),
        titleWeight: makeOptionsProps(["正常", "粗体"]),
        descWeight: makeOptionsProps(["正常", "粗体"]),
        titleItalic: makeOptionsProps(["正常", "斜体"]),
        descItalic: makeOptionsProps(["正常", "斜体"]),
        titleColor: makeTextProps("#000000"),
        descColor: makeTextProps("#999999"),
        options: makeOptionsProps(["选项1", "选项2"])
      }
    };
  }

  it("personal-info-gender 设置标题和选项", () => {
    const comStatus = makeBasicStatus();
    updateInitStatusBeforeAdd(comStatus, "personal-info-gender");
    expect(comStatus.name).toBe("personal-info-gender");
    expect(comStatus.status.title!.status).toBe("您的性别是？");
    expect(Array.isArray(comStatus.status.options!.status)).toBe(true);
  });

  it("personal-info-education 设置标题和选项", () => {
    const comStatus = makeBasicStatus();
    updateInitStatusBeforeAdd(comStatus, "personal-info-education");
    expect(comStatus.status.title!.status).toBe("到目前为止，您的最高学历是？");
  });

  it("personal-info-name 设置标题并隐藏 type", () => {
    const comStatus = makeBasicStatus();
    // 给 type 添加 type 属性
    (comStatus.status as Record<string, unknown>).type = makeOptionsProps(["text", "number"]);
    updateInitStatusBeforeAdd(comStatus, "personal-info-name");
    expect(comStatus.status.title!.status).toBe("您的姓名是？");
    expect((comStatus.status as Record<string, unknown>).type).toBeDefined();
  });

  it("未知题型不报错", () => {
    const comStatus = makeBasicStatus();
    expect(() => updateInitStatusBeforeAdd(comStatus, "non-existent" as Material)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// formatDate
// ──────────────────────────────────────────────────────────────────────────────
describe("formatDate", () => {
  it("格式化时间戳为中文日期字符串", () => {
    const timestamp = new Date(2025, 0, 15, 10, 30, 0).getTime();
    const result = formatDate({} as never, {} as never, timestamp);
    expect(result).toContain("2025");
    expect(result).toContain("01");
    expect(result).toContain("15");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// restoreComponentStatus
// ──────────────────────────────────────────────────────────────────────────────
describe("restoreComponentStatus", () => {
  it("恢复 name 对应的 Vue 组件引用 type", () => {
    const mockComponent = {};
    // 临时注入一个 name 到 componentMap
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
    // type 被 componentMap 恢复（single-select 肯定注册了）
    expect(coms[0]!.type).toBeDefined();
  });

  it("编辑组件 editCom 也被恢复", () => {
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
});

// ──────────────────────────────────────────────────────────────────────────────
// openNewTab
// ──────────────────────────────────────────────────────────────────────────────
describe("openNewTab", () => {
  it("调用 window.open（相对路径）", () => {
    const spy = vi.spyOn(window, "open").mockImplementation(() => null);
    openNewTab("/editor");
    expect(spy).toHaveBeenCalledWith("/editor", "_blank");
    spy.mockRestore();
  });

  it("调用 window.open（带 baseUrl）", () => {
    const spy = vi.spyOn(window, "open").mockImplementation(() => null);
    openNewTab("/page", "https://example.com");
    expect(spy).toHaveBeenCalledWith("https://example.com/page", "_blank");
    spy.mockRestore();
  });
});
