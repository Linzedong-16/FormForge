// ──────────────────────────────────────────────────────────────────────────────
// 动态表单引擎 —— 答案值规范化
// 对应 specs/008-dynamic-form-engine/data-model.md §1.2 与 research.md §3
// 依据：app/q-editor/src/components/SurveyComs/Materials/ 下各题型组件的真实 emit 数据形态
//
// 迁移说明（T022，原路径 src/logic/normalize.ts）：迁移至 core/logic/ 时，Material 的
// 导入来源由 "../types/material" 改为 "../schema/types"，与 types.ts（T020）保持一致，
// 切断到 vue 的 type-only 依赖链，使本文件符合 core/ 边界约束（research.md R1）
// ──────────────────────────────────────────────────────────────────────────────

import type { Material } from "../schema/types";
import type { RawAnswerValue, NormalizedValue } from "./types";

/**
 * 从 comConfig 中提取单选类题型的选项文本数组（single-select 底层存的是选项索引，
 * 需要借助该数组才能转换为对应文本值）；形状不符合预期时返回 undefined，交由调用处兜底为空。
 */
function extractOptionTexts(comConfig: unknown): string[] | undefined {
  if (typeof comConfig !== "object" || comConfig === null || !("options" in comConfig)) {
    return undefined;
  }
  const options = (comConfig as { options: unknown }).options;
  return Array.isArray(options) && options.every(item => typeof item === "string") ? (options as string[]) : undefined;
}

/**
 * 将某题目的原始答案值规范化为统一比较形态。
 * single-select 分支显式将存储的选项索引转换为对应选项的文本值，
 * 与 option-select/multi-select 保持一致语义（不修复底层存储，只在此层规范化）。
 */
export function normalizeAnswerValue(
  material: Material,
  rawValue: RawAnswerValue,
  comConfig: unknown
): NormalizedValue {
  if (rawValue === null || rawValue === undefined) {
    return { kind: "empty" };
  }

  switch (material) {
    // 单选类：底层存储为选项索引（number），借助 comConfig.options 转换为选项文本值
    case "single-select":
    case "personal-info-gender":
    case "personal-info-age":
    case "personal-info-education":
    case "personal-info-career": {
      const optionTexts = extractOptionTexts(comConfig);
      const text = optionTexts?.[rawValue as number];
      return text === undefined ? { kind: "empty" } : { kind: "text", value: text };
    }

    // 文本数组类：多选/多图选/级联路径/排序，均已是文本值，无需转换
    case "multi-select":
    case "multi-pic-select":
    case "cascader":
    case "transfer": {
      const list = rawValue as string[];
      return list.length === 0 ? { kind: "empty" } : { kind: "text-list", value: list };
    }

    // 纯文本类：直接 emit 文本字符串的题型 + 文本输入语义的 personal-info-* + 签名（dataURL/图片URL）
    case "option-select":
    case "single-pic-select":
    case "text-input":
    case "signature":
    case "personal-info-name":
    case "personal-info-id":
    case "personal-info-tel":
    case "personal-info-wechat":
    case "personal-info-qq":
    case "personal-info-email":
    case "personal-info-address":
    case "personal-info-collage":
    case "personal-info-major":
    case "personal-info-industry":
    case "personal-info-company":
    case "personal-info-position": {
      const text = rawValue as string;
      return text === "" ? { kind: "empty" } : { kind: "text", value: text };
    }

    // 数字类：评分/滑块 + 计算字段（computeDerivedField 求值结果由填写页写回同一份 answers store，
    // 与真实作答题目共用规范化路径，从而可被其他题目的显示/隐藏条件、乃至链式计算字段引用为数值来源）
    case "rate-score":
    case "slider":
    case "computed-field":
      return { kind: "number", value: rawValue as number };

    // 日期类：底层存储为 Date 对象，规范化为 ISO 字符串复用文本比较运算符实现日期范围比较
    case "date-time":
    case "personal-info-birth":
      return { kind: "text", value: (rawValue as Date).toISOString() };

    // 矩阵题：行索引 → 列索引映射，key 转为字符串以匹配 NormalizedValue 的 matrix kind 声明
    case "matrix-single": {
      const matrix = rawValue as Record<number, number>;
      const keys = Object.keys(matrix);
      if (keys.length === 0) {
        return { kind: "empty" };
      }
      const converted: Record<string, number> = {};
      for (const key of keys) {
        // noUncheckedIndexedAccess 下索引访问推断为 number | undefined；
        // key 本身来自 Object.keys(matrix)，理论上必然存在，此处仅做类型层面的安全兜底，不改变实际行为
        const value = matrix[Number(key)];
        if (value !== undefined) {
          converted[key] = value;
        }
      }
      return { kind: "matrix", value: converted };
    }

    // text-note 是非题目类型（仅用于兼容备注组件），不产生答案，防御性兜底为空
    case "text-note":
      return { kind: "empty" };

    default:
      return { kind: "empty" };
  }
}
