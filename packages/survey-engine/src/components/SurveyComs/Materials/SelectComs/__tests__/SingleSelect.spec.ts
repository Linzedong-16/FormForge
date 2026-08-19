// ──────────────────────────────────────────────────────────────────────────────
// SingleSelect 组件测试 — 选项联动候选池收窄（T012，对应 FR-010 第 1 项）
//
// 核心断言：
// 1. optionPool 为 { prompt: true } 时展示"需先完成依赖题"提示态，不渲染选项
// 2. optionPool 为收窄后的数组时，候选项通过 v-show 隐藏而非从 DOM 移除，
//    下标（:value 绑定）与顺序保持不变（因为底层答案以选项在完整数组中的原始下标存储）
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { i18n } from "../../../../../i18n";
import SingleSelect from "../SingleSelect.vue";
import type { OptionsStatus, OptionsProps, TextProps } from "../../../../../types";

// 构造一个仅需 options 差异化的最小 OptionsStatus mock，其余字段沿用固定占位值
function makeOptionsStatus(options: string[]): OptionsStatus {
  const textProp = (status: string): TextProps => ({ id: "x", isShow: true, name: "x", editCom: {} as never, status });
  const optionsProp = (status: string[]): OptionsProps => ({
    id: "x",
    isShow: true,
    name: "x",
    editCom: {} as never,
    status,
    currentStatus: 0
  });
  return {
    title: textProp("标题"),
    desc: textProp(""),
    position: optionsProp(["左对齐", "居中"]),
    titleSize: optionsProp(["16", "18"]),
    descSize: optionsProp(["14", "16"]),
    titleWeight: optionsProp(["正常", "粗体"]),
    descWeight: optionsProp(["正常", "粗体"]),
    titleItalic: optionsProp(["正常", "斜体"]),
    descItalic: optionsProp(["正常", "斜体"]),
    titleColor: textProp("#000000"),
    descColor: textProp("#999999"),
    options: optionsProp(options)
  };
}

function mountSingleSelect(options: string[], optionPool?: string[] | { prompt: true }) {
  return mount(SingleSelect, {
    props: { serialNum: 1, status: makeOptionsStatus(options), optionPool },
    global: { plugins: [ElementPlus, i18n] }
  });
}

describe("SingleSelect — 选项联动候选池", () => {
  it("optionPool 为 { prompt: true } 时展示提示态，不渲染任何选项", () => {
    const wrapper = mountSingleSelect(["选项A", "选项B", "选项C"], { prompt: true });

    expect(wrapper.text()).toContain("请先完成前面依赖的题目");
    expect(wrapper.findAllComponents({ name: "ElRadio" })).toHaveLength(0);
  });

  it("未启用 optionPool（undefined）时展示全部选项", () => {
    const wrapper = mountSingleSelect(["选项A", "选项B", "选项C"]);
    const radios = wrapper.findAll(".el-radio");

    expect(radios).toHaveLength(3);
    radios.forEach(radio => expect(radio.isVisible()).toBe(true));
  });

  it("optionPool 收窄后，候选池外的选项通过 v-show 隐藏但保留 DOM 节点与原始下标顺序", () => {
    const wrapper = mountSingleSelect(["选项A", "选项B", "选项C"], ["选项A", "选项C"]);
    const radios = wrapper.findAll(".el-radio");

    // 三个选项节点均存在（未被过滤移除），仅可见性不同
    expect(radios).toHaveLength(3);
    expect(radios[0]!.isVisible()).toBe(true); // 选项A：候选池内
    expect(radios[1]!.isVisible()).toBe(false); // 选项B：候选池外，v-show 隐藏
    expect(radios[2]!.isVisible()).toBe(true); // 选项C：候选池内

    // 隐藏节点仍保留原始文本与下标位置，未被数组过滤移除
    expect(radios[1]!.text()).toBe("选项B");
  });
});
