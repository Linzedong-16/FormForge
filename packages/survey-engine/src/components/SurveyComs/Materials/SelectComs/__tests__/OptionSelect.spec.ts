// ──────────────────────────────────────────────────────────────────────────────
// OptionSelect 组件测试 — 选项联动候选池收窄（T013，对应 FR-010 第 1 项）
//
// 与 SingleSelect 不同：OptionSelect 的答案以选项文本本身存储（非下标），
// 因此候选池收窄采用 displayOptions 过滤计算属性，直接从下拉框选项中移除
// 候选池外的选项，而非 v-show 隐藏。
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { i18n } from "../../../../../i18n";
import OptionSelect from "../OptionSelect.vue";
import type { OptionsStatus, OptionsProps, TextProps } from "../../../../../types";

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

function mountOptionSelect(options: string[], optionPool?: string[] | { prompt: true }) {
  return mount(OptionSelect, {
    props: { serialNum: 1, status: makeOptionsStatus(options), optionPool },
    global: { plugins: [ElementPlus, i18n] }
  });
}

// displayOptions 是 <script setup> 内部计算属性，未通过 defineExpose 暴露为公共 API，
// vue-tsc 静态类型检查无法识别其存在（仅 vitest 运行时可通过开发模式实例访问）。
// 与公共 props/emit 类型完全不重叠，需先经 unknown 中转才能收窄，而非直接结构化断言，
// 以此替代 any，同时不修改组件本身的公共 API
function getDisplayOptions(vm: object): string[] | undefined {
  return (vm as unknown as { displayOptions?: string[] }).displayOptions;
}

describe("OptionSelect — 选项联动候选池", () => {
  it("optionPool 为 { prompt: true } 时展示提示态，不渲染下拉框", () => {
    const wrapper = mountOptionSelect(["选项A", "选项B", "选项C"], { prompt: true });

    expect(wrapper.text()).toContain("请先完成前面依赖的题目");
    expect(wrapper.findComponent({ name: "ElSelect" }).exists()).toBe(false);
  });

  it("未启用 optionPool（undefined）时 displayOptions 展示全部选项", () => {
    const wrapper = mountOptionSelect(["选项A", "选项B", "选项C"]);

    expect(getDisplayOptions(wrapper.vm)).toEqual(["选项A", "选项B", "选项C"]);
  });

  it("optionPool 收窄后，displayOptions 仅保留候选池内的选项", () => {
    const wrapper = mountOptionSelect(["选项A", "选项B", "选项C"], ["选项A", "选项C"]);

    expect(getDisplayOptions(wrapper.vm)).toEqual(["选项A", "选项C"]);
  });
});
