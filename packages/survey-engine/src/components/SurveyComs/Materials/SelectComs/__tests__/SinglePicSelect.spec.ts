// ──────────────────────────────────────────────────────────────────────────────
// SinglePicSelect 组件测试 — 答案发射修复（T023，对应 FR-010 第 5 项）
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { i18n } from "../../../../../i18n";
import SinglePicSelect from "../SinglePicSelect.vue";
import type { OptionsStatus, OptionsProps, TextProps } from "../../../../../types";

function makeStatus(): OptionsStatus {
  const textProp = (status: string): TextProps => ({ id: "x", isShow: true, name: "x", editCom: {} as never, status });
  const optionsProp = (status: OptionsStatus["options"]["status"]): OptionsProps => ({
    id: "x",
    isShow: true,
    name: "x",
    editCom: {} as never,
    status,
    currentStatus: 0
  });
  return {
    title: textProp("图片单选题"),
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
    options: optionsProp([
      { picTitle: "选项A", picDesc: "", value: "a" },
      { picTitle: "选项B", picDesc: "", value: "b" }
    ])
  };
}

function mountSinglePicSelect() {
  return mount(SinglePicSelect, {
    props: { serialNum: 1, status: makeStatus() },
    global: { plugins: [ElementPlus, i18n] }
  });
}

describe("SinglePicSelect — 答案发射", () => {
  it("选中选项后，emit updateAnswer 且携带值与选中项一致", async () => {
    const wrapper = mountSinglePicSelect();

    const radios = wrapper.findAll('input[type="radio"]');
    expect(radios.length).toBe(2);

    await radios[1].setValue();

    const emitted = wrapper.emitted("updateAnswer");
    expect(emitted).toBeTruthy();
    expect(emitted?.at(-1)).toEqual(["选项B"]);
  });
});
