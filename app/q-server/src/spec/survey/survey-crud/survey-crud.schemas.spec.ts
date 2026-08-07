/**
 * 问卷模块 survey-crud Zod Schema 单测
 *
 * 覆盖：createSurveySchema 中 components[].client_key 与 logic 字段的可空语义对称性（D5 回归）
 */
import { describe, it, expect } from "vitest";
import { createSurveySchema } from "../../../modules/survey/survey-crud/survey-crud.schemas.js";

describe("createSurveySchema — components.client_key / logic nullable 对称性", () => {
  const baseComponent = {
    type: "single_select",
    config: { title: { status: "示例题目", isShow: true } },
    order_index: 0,
    required: 0 as const
  };

  it("logic 显式传 null — 通过校验（现有行为，作为对照基线）", () => {
    const result = createSurveySchema.safeParse({
      title: "测试问卷",
      components: [{ ...baseComponent, logic: null }]
    });

    expect(result.success).toBe(true);
  });

  // ── D5 回归测试：client_key 应与 logic 享有同等的 nullable 语义 ──
  // 修复前：client_key 缺少 .nullable()，显式传 null 会被 Zod 拒绝
  it("[D5回归] client_key 显式传 null — 应通过校验，等价于未提供", () => {
    const result = createSurveySchema.safeParse({
      title: "测试问卷",
      components: [{ ...baseComponent, client_key: null }]
    });

    expect(result.success).toBe(true);
  });
});
