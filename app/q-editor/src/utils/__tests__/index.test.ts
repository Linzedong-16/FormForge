/**
 * 工具库 index.ts 单元测试
 *
 * 测试范围：
 *   1. getTextStatus / getStringStatus / getCurrentStatus
 *   2. getStringStatusByCurrentStatus / getValueStatusByCurrentStatus
 *   3. getPicTitleDescStatusArr / getValueStatus
 *   4. isValueStatusArray / isPicTitleDescArray
 *   5. changeEditorIsShowStatus
 *   6. updateInitStatusBeforeAdd
 *   7. formatDate
 *   8. restoreComponentStatus
 *   9. openNewTab
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
} from "../index";
import type { TextProps, OptionsProps, Status, TypeStatus } from "@/types";

// ─── 测试数据工厂 ──────────────────────────────────────────

function makeTextProps(status: string): TextProps {
  return { status, isShow: true, name: "title-editor", id: "test-id" } as TextProps;
}

function makeOptionsProps(currentStatus: number, status: unknown[]): OptionsProps {
  return { currentStatus, status, isShow: true, name: "options-editor", id: "test-id" } as OptionsProps;
}

function makeStatus(name: string, extra?: Record<string, unknown>): Status {
  return {
    id: `test-${name}`,
    name,
    type: {},
    status: { title: { status: "test", isShow: true }, ...extra }
  } as unknown as Status;
}

// ─── getTextStatus ─────────────────────────────────────────

describe("getTextStatus", () => {
  it("应返回文本状态值", () => {
    const props = makeTextProps("hello");
    expect(getTextStatus(props)).toBe("hello");
  });

  it("应返回空字符串", () => {
    const props = makeTextProps("");
    expect(getTextStatus(props)).toBe("");
  });
});

// ─── getStringStatus ───────────────────────────────────────

describe("getStringStatus", () => {
  it("应返回选项状态数组", () => {
    const props = makeOptionsProps(0, ["a", "b", "c"]);
    expect(getStringStatus(props)).toEqual(["a", "b", "c"]);
  });
});

// ─── getCurrentStatus ──────────────────────────────────────

describe("getCurrentStatus", () => {
  it("应返回当前选中索引", () => {
    const props = makeOptionsProps(2, ["a", "b", "c"]);
    expect(getCurrentStatus(props)).toBe(2);
  });

  it("默认返回 0", () => {
    const props = makeOptionsProps(0, ["a"]);
    expect(getCurrentStatus(props)).toBe(0);
  });
});

// ─── getStringStatusByCurrentStatus ────────────────────────

describe("getStringStatusByCurrentStatus", () => {
  it("应返回当前选中索引对应的状态值", () => {
    const props = makeOptionsProps(1, ["small", "medium", "large"]);
    expect(getStringStatusByCurrentStatus(props)).toBe("medium");
  });

  it("索引 0 应返回第一个值", () => {
    const props = makeOptionsProps(0, ["a", "b"]);
    expect(getStringStatusByCurrentStatus(props)).toBe("a");
  });
});

// ─── isValueStatusArray ────────────────────────────────────

describe("isValueStatusArray", () => {
  it("应识别有效的 ValueStatusArr", () => {
    const arr = [{ value: "v1", status: "s1" }];
    expect(isValueStatusArray(arr)).toBe(true);
  });

  it("非数组应返回 false", () => {
    expect(isValueStatusArray("not-array" as any)).toBe(false);
  });

  it("空数组应返回 false", () => {
    expect(isValueStatusArray([])).toBe(false);
  });

  it("缺少 value 字段的数组应返回 false", () => {
    expect(isValueStatusArray([{ status: "s1" }] as any)).toBe(false);
  });
});

// ─── isPicTitleDescArray ───────────────────────────────────

describe("isPicTitleDescArray", () => {
  it("应识别有效的 PicTitleDescStatusArr", () => {
    const arr = [{ picTitle: "t1", picDesc: "d1" }];
    expect(isPicTitleDescArray(arr)).toBe(true);
  });

  it("非数组应返回 false", () => {
    expect(isPicTitleDescArray("not-array" as any)).toBe(false);
  });

  it("缺少 picTitle 字段应返回 false", () => {
    expect(isPicTitleDescArray([{ picDesc: "d1" }] as any)).toBe(false);
  });
});

// ─── getValueStatusByCurrentStatus ─────────────────────────

describe("getValueStatusByCurrentStatus", () => {
  it("应返回 ValueStatusArr 类型的当前值", () => {
    const props = makeOptionsProps(1, [
      { value: "v1", status: "s1" },
      { value: "v2", status: "s2" }
    ]);
    const result = getValueStatusByCurrentStatus(props);
    expect(result).toEqual({ value: "v2", status: "s2" });
  });

  it("非 ValueStatusArr 应返回 undefined", () => {
    const props = makeOptionsProps(0, ["a", "b"]);
    expect(getValueStatusByCurrentStatus(props)).toBeUndefined();
  });
});

// ─── getPicTitleDescStatusArr ──────────────────────────────

describe("getPicTitleDescStatusArr", () => {
  it("应返回图片标题描述数组", () => {
    // isPicTitleDescStatusArr 需要 value 字段
    const arr = [{ picTitle: "t1", picDesc: "d1", value: "v1" }];
    const props = { currentStatus: 0, status: arr } as OptionsProps;
    expect(getPicTitleDescStatusArr(props)).toEqual(arr);
  });

  it("非图片标题描述数组应返回 undefined", () => {
    const props = { currentStatus: 0, status: ["a"] } as OptionsProps;
    expect(getPicTitleDescStatusArr(props)).toBeUndefined();
  });
});

// ─── getValueStatus ────────────────────────────────────────

describe("getValueStatus", () => {
  it("应返回 ValueStatusArr", () => {
    const arr = [{ value: "v1", status: "s1" }];
    const props = { currentStatus: 0, status: arr } as OptionsProps;
    expect(getValueStatus(props)).toEqual(arr);
  });
});

// ─── changeEditorIsShowStatus ──────────────────────────────

describe("changeEditorIsShowStatus", () => {
  function makeTypeStatus(): TypeStatus {
    return {
      type: { currentStatus: 0, status: [], isShow: true, name: "text-type-editor" },
      title: { status: "title", isShow: true, name: "title-editor" },
      desc: { status: "desc", isShow: true, name: "desc-editor" },
      position: { currentStatus: 0, status: [], isShow: true, name: "position-editor" },
      titleSize: { currentStatus: 0, status: [], isShow: true, name: "size-editor" },
      descSize: { currentStatus: 0, status: [], isShow: true, name: "size-editor" },
      titleWeight: { currentStatus: 1, status: [], isShow: true, name: "weight-editor" },
      descWeight: { currentStatus: 1, status: [], isShow: true, name: "weight-editor" },
      titleItalic: { currentStatus: 1, status: [], isShow: true, name: "italic-editor" },
      descItalic: { currentStatus: 1, status: [], isShow: true, name: "italic-editor" },
      titleColor: { status: "#000", isShow: true, name: "color-editor" },
      descColor: { status: "#909399", isShow: true, name: "color-editor" }
    } as unknown as TypeStatus;
  }

  it("type 不匹配时应切换所有编辑器的显示状态", () => {
    const status = makeTypeStatus();
    changeEditorIsShowStatus(status, 1); // currentStatus is 0, type is 1
    expect(status.title.isShow).toBe(false);
    expect(status.desc.isShow).toBe(false);
    expect(status.position.isShow).toBe(false);
    expect(status.titleSize.isShow).toBe(false);
    expect(status.descSize.isShow).toBe(false);
    expect(status.titleWeight.isShow).toBe(false);
    expect(status.descWeight.isShow).toBe(false);
    expect(status.titleItalic.isShow).toBe(false);
    expect(status.descItalic.isShow).toBe(false);
    expect(status.titleColor.isShow).toBe(false);
    expect(status.descColor.isShow).toBe(false);
  });

  it("type 匹配时不应改变显示状态", () => {
    const status = makeTypeStatus();
    changeEditorIsShowStatus(status, 0); // matches currentStatus
    expect(status.title.isShow).toBe(true);
    expect(status.desc.isShow).toBe(true);
  });
});

// ─── updateInitStatusBeforeAdd ─────────────────────────────

describe("updateInitStatusBeforeAdd", () => {
  it("应正确设置个人性别信息", () => {
    const com = makeStatus("single-select", { options: { status: [] } });
    updateInitStatusBeforeAdd(com, "personal-info-gender");
    expect(com.name).toBe("personal-info-gender");
    expect((com.status as any).title?.status).toBe("您的性别是？");
  });

  it("应正确设置个人学历信息", () => {
    const com = makeStatus("single-select", { options: { status: [] } });
    updateInitStatusBeforeAdd(com, "personal-info-education");
    expect(com.name).toBe("personal-info-education");
    expect((com.status as any).title?.status).toBe("到目前为止，您的最高学历是？");
  });

  it("应正确设置个人姓名信息", () => {
    const com = makeStatus("text-input", { type: { isShow: true } });
    updateInitStatusBeforeAdd(com, "personal-info-name");
    expect(com.name).toBe("personal-info-name");
    expect((com.status as any).title?.status).toBe("您的姓名是？");
    expect((com.status as any).type?.isShow).toBe(false);
  });

  it("应正确设置个人年龄信息", () => {
    const com = makeStatus("single-select", { options: { status: [] } });
    updateInitStatusBeforeAdd(com, "personal-info-age");
    expect(com.name).toBe("personal-info-age");
    expect((com.status as any).title?.status).toBe("您的年龄是？");
  });

  it("应正确设置个人职业信息", () => {
    const com = makeStatus("single-select", { options: { status: [] } });
    updateInitStatusBeforeAdd(com, "personal-info-career");
    expect(com.name).toBe("personal-info-career");
    expect((com.status as any).title?.status).toBe("您目前的职业是？");
  });

  it("未匹配的组件名不应修改 name", () => {
    const com = makeStatus("single-select");
    const originalName = com.name;
    updateInitStatusBeforeAdd(com, "unknown-material" as any);
    expect(com.name).toBe(originalName);
  });
});

// ─── formatDate ────────────────────────────────────────────

describe("formatDate", () => {
  it("应格式化时间戳为日期字符串", () => {
    const result = formatDate({} as any, {} as any, 1700000000000);
    expect(result).toContain("2023");
  });
});

// ─── restoreComponentStatus ────────────────────────────────

describe("restoreComponentStatus", () => {
  it("空数组应不报错", () => {
    expect(() => restoreComponentStatus([])).not.toThrow();
  });

  it("应不修改已有 type 的组件", () => {
    const coms = [makeStatus("single-select")];
    const originalType = coms[0]!.type;
    restoreComponentStatus(coms);
    expect(coms[0]!.type).toBe(originalType);
  });

  it("应处理未知组件名", () => {
    const coms = [{ id: "x", name: "unknown-comp", type: {}, status: {} } as unknown as Status];
    expect(() => restoreComponentStatus(coms)).not.toThrow();
  });
});

// ─── openNewTab ────────────────────────────────────────────

describe("openNewTab", () => {
  beforeEach(() => {
    vi.stubGlobal("open", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("应调用 window.open", () => {
    openNewTab("/test");
    expect(window.open).toHaveBeenCalledWith("/test", "_blank");
  });

  it("应支持 baseUrl", () => {
    openNewTab("/test", "https://example.com");
    expect(window.open).toHaveBeenCalledWith("https://example.com/test", "_blank");
  });
});