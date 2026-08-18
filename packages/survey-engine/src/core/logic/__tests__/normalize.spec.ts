// ──────────────────────────────────────────────────────────────────────────────
// normalizeAnswerValue — 单元测试
// 覆盖现有 14+ 种题型（含 personal-info-* 复用题型）的答案规范化分支与空值/边界场景
// 依据：app/q-editor/src/components/SurveyComs/Materials/ 下各题型组件的真实 emit 数据形态
//
// 迁移说明（T019，原路径 src/logic/__tests__/normalize.spec.ts）：迁移至 core/logic/__tests__/
// 时，Material 类型的导入来源由 "../../types/material" 改为 "../../schema/types"，
// 与 normalize.ts 本身（T022）的迁移保持一致，断言内容不变
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { normalizeAnswerValue } from "../normalize";
import type { Material } from "../../schema/types";

// ═══════════════════════════════════════════════════════════════════════════════
// 空值/未作答场景：任意题型，rawValue 为 null/undefined 均判定为空
// ═══════════════════════════════════════════════════════════════════════════════
describe("normalizeAnswerValue — 空值判定", () => {
  it.each<[Material, null | undefined]>([
    ["text-input", null],
    ["text-input", undefined],
    ["single-select", null],
    ["matrix-single", undefined]
  ])("%s 题型 rawValue=%s → { kind: 'empty' }", (material, rawValue) => {
    expect(normalizeAnswerValue(material, rawValue, undefined)).toEqual({ kind: "empty" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// single-select 及复用其语义的 personal-info-*：底层存储为选项索引，须借助
// comConfig.options 转换为选项文本值
// ═══════════════════════════════════════════════════════════════════════════════
describe("normalizeAnswerValue — 单选题（索引转文本值）", () => {
  const comConfig = { options: ["选项A", "选项B", "选项C"] };

  it.each<Material>(["single-select", "personal-info-gender", "personal-info-age", "personal-info-education", "personal-info-career"])(
    "%s：索引 1 → 选项B 文本值",
    (material) => {
      expect(normalizeAnswerValue(material, 1, comConfig)).toEqual({ kind: "text", value: "选项B" });
    }
  );

  it("索引越界（选项配置已变更但答案未同步）→ empty", () => {
    expect(normalizeAnswerValue("single-select", 99, comConfig)).toEqual({ kind: "empty" });
  });

  it("comConfig 缺失 → empty（无法解析选项文本，安全兜底）", () => {
    expect(normalizeAnswerValue("single-select", 0, undefined)).toEqual({ kind: "empty" });
  });

  it("comConfig.options 不是字符串数组 → empty（安全兜底）", () => {
    expect(normalizeAnswerValue("single-select", 0, { options: [1, 2, 3] })).toEqual({ kind: "empty" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 文本数组类：multi-select / multi-pic-select / cascader / transfer 均已是文本值，无需转换
// ═══════════════════════════════════════════════════════════════════════════════
describe("normalizeAnswerValue — 文本数组类题型", () => {
  it.each<Material>(["multi-select", "multi-pic-select", "cascader", "transfer"])(
    "%s：文本数组直接透传",
    (material) => {
      expect(normalizeAnswerValue(material, ["选项1", "选项2"], undefined)).toEqual({
        kind: "text-list",
        value: ["选项1", "选项2"]
      });
    }
  );

  it.each<Material>(["multi-select", "multi-pic-select", "cascader", "transfer"])(
    "%s：空数组（未作答）→ empty",
    (material) => {
      expect(normalizeAnswerValue(material, [], undefined)).toEqual({ kind: "empty" });
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// 纯文本类：option-select / single-pic-select / text-input / signature /
// personal-info-*（文本输入语义的 12 项）均直接 emit 文本字符串，无需转换
// ═══════════════════════════════════════════════════════════════════════════════
describe("normalizeAnswerValue — 纯文本类题型", () => {
  const textMaterials: Material[] = [
    "option-select",
    "single-pic-select",
    "text-input",
    "signature",
    "personal-info-name",
    "personal-info-id",
    "personal-info-tel",
    "personal-info-wechat",
    "personal-info-qq",
    "personal-info-email",
    "personal-info-address",
    "personal-info-collage",
    "personal-info-major",
    "personal-info-industry",
    "personal-info-company",
    "personal-info-position"
  ];

  it.each(textMaterials)("%s：文本值直接透传", (material) => {
    expect(normalizeAnswerValue(material, "已作答内容", undefined)).toEqual({ kind: "text", value: "已作答内容" });
  });

  it.each(textMaterials)("%s：空字符串（未作答/签名已清空）→ empty", (material) => {
    expect(normalizeAnswerValue(material, "", undefined)).toEqual({ kind: "empty" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 数字类：rate-score / slider 直接 emit number
// ═══════════════════════════════════════════════════════════════════════════════
describe("normalizeAnswerValue — 数字类题型", () => {
  it.each<Material>(["rate-score", "slider"])("%s：数字值直接透传", (material) => {
    expect(normalizeAnswerValue(material, 4, undefined)).toEqual({ kind: "number", value: 4 });
  });

  it.each<Material>(["rate-score", "slider"])("%s：数字 0 是合法作答值，不判定为空", (material) => {
    expect(normalizeAnswerValue(material, 0, undefined)).toEqual({ kind: "number", value: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 日期类：date-time 及复用其语义的 personal-info-birth，emit Date 对象，
// 规范化为 ISO 字符串（text kind）以复用文本比较运算符实现日期范围比较
// ═══════════════════════════════════════════════════════════════════════════════
describe("normalizeAnswerValue — 日期类题型", () => {
  it.each<Material>(["date-time", "personal-info-birth"])("%s：Date 对象 → ISO 字符串", (material) => {
    const date = new Date("2026-01-15T00:00:00.000Z");
    expect(normalizeAnswerValue(material, date, undefined)).toEqual({
      kind: "text",
      value: "2026-01-15T00:00:00.000Z"
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 矩阵题：matrix-single 存储为「行索引 → 列索引」映射，key 转为字符串以匹配
// NormalizedValue 的 matrix kind 声明（Record<string, number>）
// ═══════════════════════════════════════════════════════════════════════════════
describe("normalizeAnswerValue — 矩阵题", () => {
  it("行列索引映射 → key 转字符串后透传", () => {
    expect(normalizeAnswerValue("matrix-single", { 0: 2, 1: 0 }, undefined)).toEqual({
      kind: "matrix",
      value: { "0": 2, "1": 0 }
    });
  });

  it("空映射（未作答任意一行）→ empty", () => {
    expect(normalizeAnswerValue("matrix-single", {}, undefined)).toEqual({ kind: "empty" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// text-note：非题目类型（Material 联合类型中用于兼容备注组件的伪题型），不产生答案
// ═══════════════════════════════════════════════════════════════════════════════
describe("normalizeAnswerValue — text-note（非题目类型）", () => {
  it("任意 rawValue → empty（防御性分支，不应被规则实际引用）", () => {
    expect(normalizeAnswerValue("text-note", "任意值", undefined)).toEqual({ kind: "empty" });
  });
});
