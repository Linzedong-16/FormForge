// ──────────────────────────────────────────────────────────────────────────────
// 问卷引擎类型谓词 — 单元测试
// 覆盖 types/editProps.ts 与 types/material.ts 中的类型守卫函数
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  isStringArray,
  isValueStatusArr,
  isPicTitleDescStatusArr,
  isCascaderArr,
  isPicLink,
  isRateScoreDesc,
  isOptionsProps,
  IsOptionsStatus,
  IsTypeStatus
} from "../types/editProps";
import { isSurveyComName, isUseForPDF } from "../types/material";
import { canUsedForPDF } from "../types/store";
import type { BaseStatus, OptionsStatus, TypeStatus, TextProps, OptionsProps } from "../types";

// ═══════════════════════════════════════════════════════════════════════════════
// isStringArray
// ═══════════════════════════════════════════════════════════════════════════════
describe("isStringArray", () => {
  it("纯字符串数组 → true", () => {
    expect(isStringArray(["a", "b", "c"])).toBe(true);
  });

  it("数值数组 → false（typeof number !== 'string'）", () => {
    expect(isStringArray([1, 2, 3] as unknown[] as string[])).toBe(false);
  });

  it("对象数组 → false", () => {
    expect(
      isStringArray([{ value: "v1", status: "选项1" }] as never)
    ).toBe(false);
  });

  it("空数组 → false（安全兜底）", () => {
    expect(isStringArray([])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isValueStatusArr
// ═══════════════════════════════════════════════════════════════════════════════
describe("isValueStatusArr", () => {
  it("{ value, status } 对象数组 → true", () => {
    expect(isValueStatusArr([{ value: "v1", status: "选项1" }])).toBe(true);
  });

  it("字符串数组 → false", () => {
    expect(isValueStatusArr(["a", "b"])).toBe(false);
  });

  it("缺 status 字段的对象数组 → false", () => {
    expect(isValueStatusArr([{ value: "v1" }] as never)).toBe(false);
  });

  it("空数组 → false", () => {
    expect(isValueStatusArr([])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isPicTitleDescStatusArr
// ═══════════════════════════════════════════════════════════════════════════════
describe("isPicTitleDescStatusArr", () => {
  it("{ picTitle, picDesc, value } 对象数组 → true", () => {
    expect(
      isPicTitleDescStatusArr([{ picTitle: "图1", picDesc: "描述", value: "url" }])
    ).toBe(true);
  });

  it("缺 picTitle 字段 → false", () => {
    expect(
      isPicTitleDescStatusArr([{ picDesc: "描述", value: "url" }] as never)
    ).toBe(false);
  });

  it("字符串数组 → false", () => {
    expect(isPicTitleDescStatusArr(["a"])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isCascaderArr
// ═══════════════════════════════════════════════════════════════════════════════
describe("isCascaderArr", () => {
  it("{ label, value, children? } 对象数组 → true", () => {
    expect(isCascaderArr([{ label: "北京", value: "beijing" }])).toBe(true);
  });

  it("含 status 字段的对象（ValueStatus）→ false", () => {
    expect(
      isCascaderArr([{ label: "x", value: "y", status: "s" }] as never)
    ).toBe(false);
  });

  it("含 picTitle 字段的对象（PicTitleDesc）→ false", () => {
    expect(
      isCascaderArr([{ label: "x", value: "y", picTitle: "p" }] as never)
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isPicLink
// ═══════════════════════════════════════════════════════════════════════════════
describe("isPicLink", () => {
  it("{ link, index } → true", () => {
    expect(isPicLink({ link: "http://example.com/1.png", index: 0 })).toBe(true);
  });

  it("{ link } 缺 index → false", () => {
    expect(isPicLink({ link: "url" })).toBe(false);
  });

  it("空对象 → false", () => {
    expect(isPicLink({})).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isRateScoreDesc
// ═══════════════════════════════════════════════════════════════════════════════
describe("isRateScoreDesc", () => {
  it("{ index, val } → true", () => {
    expect(isRateScoreDesc({ index: 0, val: "非常满意" })).toBe(true);
  });

  it("缺 val → false", () => {
    expect(isRateScoreDesc({ index: 0 })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isOptionsProps
// ═══════════════════════════════════════════════════════════════════════════════
describe("isOptionsProps", () => {
  it("status 为数组 → true", () => {
    const props: OptionsProps = {
      id: "o1",
      isShow: true,
      name: "options",
      editCom: {} as never,
      status: ["a", "b"],
      currentStatus: 0
    };
    expect(isOptionsProps(props)).toBe(true);
  });

  it("status 为字符串（TextProps）→ false", () => {
    const props: TextProps = {
      id: "t1",
      isShow: true,
      name: "title",
      editCom: {} as never,
      status: "hello"
    };
    expect(isOptionsProps(props)).toBe(false);
  });

  it("undefined → falsy（短路求值返回 undefined 而非 false）", () => {
    // isOptionsProps 实现为 `props && Array.isArray(props.status)`
    // 当 props 为 undefined 时返回 undefined（falsy），对外使用等价于 false
    expect(isOptionsProps(undefined as never)).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// IsOptionsStatus
// ═══════════════════════════════════════════════════════════════════════════════
describe("IsOptionsStatus", () => {
  it("含 options 属性的 status → true", () => {
    const status = {
      title: {} as TextProps,
      desc: {} as TextProps,
      options: {} as OptionsProps
    } as unknown as BaseStatus;
    // 但这里需要所有 BaseStatus 字段，构造一个最小模拟
    const s = { options: { status: [] } } as unknown as BaseStatus;
    expect(IsOptionsStatus(s)).toBe(true);
  });

  it("不含 options 属性的 status → false", () => {
    const s = {} as BaseStatus;
    expect(IsOptionsStatus(s)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// IsTypeStatus
// ═══════════════════════════════════════════════════════════════════════════════
describe("IsTypeStatus", () => {
  it("含 type 属性的 status → true", () => {
    const s = { type: {} } as unknown as BaseStatus;
    expect(IsTypeStatus(s)).toBe(true);
  });

  it("不含 type 属性 → false", () => {
    const s = {} as BaseStatus;
    expect(IsTypeStatus(s)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isSurveyComName
// ═══════════════════════════════════════════════════════════════════════════════
describe("isSurveyComName", () => {
  it.each([
    "single-select",
    "multi-select",
    "option-select",
    "single-pic-select",
    "multi-pic-select",
    "text-input",
    "rate-score",
    "date-time",
    "cascader",
    "matrix-single",
    "slider",
    "transfer",
    "signature"
  ])("标准题型 %s → true", name => {
    expect(isSurveyComName(name)).toBe(true);
  });

  it("text-note（非题目类型）→ false", () => {
    expect(isSurveyComName("text-note")).toBe(false);
  });

  it("随机字符串 → false", () => {
    expect(isSurveyComName("random-string")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isUseForPDF
// ═══════════════════════════════════════════════════════════════════════════════
describe("isUseForPDF", () => {
  it("single-select → true", () => {
    expect(isUseForPDF("single-select")).toBe(true);
  });

  it("cascader（不支持PDF）→ false", () => {
    expect(isUseForPDF("cascader")).toBe(false);
  });

  it("slider（不支持PDF）→ false", () => {
    expect(isUseForPDF("slider")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// canUsedForPDF
// ═══════════════════════════════════════════════════════════════════════════════
describe("canUsedForPDF", () => {
  it("支持PDF的题型 → true", () => {
    expect(canUsedForPDF("single-select")).toBe(true);
  });

  it("不支持PDF的题型 → false", () => {
    expect(canUsedForPDF("slider")).toBe(false);
  });

  it("未知字符串 → true（排除列表仅含特定题型，非命中项均可导出 PDF）", () => {
    // canUsedForPDF 使用排除列表，不在排除列表中即返回 true
    expect(canUsedForPDF("unknown")).toBe(true);
  });
});
