/**
 * useSurveyNo composable 单元测试
 *
 * 测试范围：
 *   1. 空数组返回空映射
 *   2. 正确分配序号给问卷题目组件
 *   3. text-note 等非题目组件返回 null
 *   4. 混合组件正确编号
 */
import { describe, it, expect } from "vitest";
import { useSurveyNo } from "../hooks";
import type { Status } from "@/types";

function mockStatus(name: string, id?: string): Status {
  return {
    id: id ?? `test-${name}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    type: {},
    status: { title: { status: "test", isShow: true } }
  } as unknown as Status;
}

describe("useSurveyNo", () => {
  it("空数组应返回空数组", () => {
    const { value } = useSurveyNo([]);
    expect(value).toEqual([]);
  });

  it("只有非题目组件时应全部返回 null", () => {
    const { value } = useSurveyNo([
      mockStatus("text-note"),
      mockStatus("text-note")
    ]);
    expect(value).toEqual([null, null]);
  });

  it("只有题目组件时应按顺序编号", () => {
    const { value } = useSurveyNo([
      mockStatus("single-select"),
      mockStatus("multi-select"),
      mockStatus("text-input")
    ]);
    expect(value).toEqual([1, 2, 3]);
  });

  it("混合题目和非题目组件时应正确编号", () => {
    const { value } = useSurveyNo([
      mockStatus("text-note"),
      mockStatus("single-select"),
      mockStatus("text-note"),
      mockStatus("multi-select"),
      mockStatus("text-note"),
      mockStatus("text-input")
    ]);
    expect(value).toEqual([null, 1, null, 2, null, 3]);
  });

  it("应正确识别所有类型的题目组件", () => {
    const { value } = useSurveyNo([
      mockStatus("single-select"),
      mockStatus("single-pic-select"),
      mockStatus("multi-select"),
      mockStatus("option-select"),
      mockStatus("multi-pic-select"),
      mockStatus("text-input"),
      mockStatus("personal-info-gender"),
      mockStatus("personal-info-age"),
      mockStatus("personal-info-education"),
      mockStatus("personal-info-career"),
      mockStatus("rate-score"),
      mockStatus("date-time"),
      mockStatus("cascader"),
      mockStatus("matrix-single"),
      mockStatus("slider"),
      mockStatus("transfer"),
      mockStatus("personal-info-name"),
      mockStatus("personal-info-tel"),
      mockStatus("personal-info-email"),
      mockStatus("personal-info-address")
    ]);
    expect(value).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("text-note 应被识别为非题目组件", () => {
    const { value } = useSurveyNo([mockStatus("text-note")]);
    expect(value).toEqual([null]);
  });
});