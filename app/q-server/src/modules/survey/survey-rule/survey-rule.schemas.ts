/**
 * 问卷动态规则模块 — Zod Schema 定义
 *
 * 与 packages/survey-engine/src/logic/types.ts（T004）的 TypeScript 类型定义严格镜像，
 * 用于 survey-crud 模块对请求体 logic 字段的运行时校验，
 * 以及 survey-rule 模块对已持久化 logic 配置做发布前完整性校验时的输入兜底校验。
 */

import { z } from "zod";

// ══════════════════════════════════════════════════════════════════
//  1.1 基础引用与比较运算符
// ══════════════════════════════════════════════════════════════════

/** 稳定题目引用键，对应 SurveyComponent.client_key，长度上限与该列 VARCHAR(64) 保持一致 */
const clientKeySchema = z.string().min(1, "client_key 不能为空").max(64, "client_key 最多64个字符");

/** 比较运算符：与 ComparisonOperator 完全一致 */
const comparisonOperatorSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "notContains",
  "gt",
  "gte",
  "lt",
  "lte",
  "isEmpty",
  "isNotEmpty"
]);

/** 条件组合方式：与 LogicCombinator 完全一致 */
const logicCombinatorSchema = z.enum(["AND", "OR"]);

// ══════════════════════════════════════════════════════════════════
//  1.3 单条条件与条件组（Condition Group）
// ══════════════════════════════════════════════════════════════════

/** 单条比较条件；isEmpty/isNotEmpty 时 value 可省略，故此处保持 optional 不强制要求 */
const conditionSchema = z.object({
  sourceKey: clientKeySchema,
  operator: comparisonOperatorSchema,
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional()
});

/** 条件组：一组 Condition 以 AND/OR 组合 */
const conditionGroupSchema = z.object({
  combinator: logicCombinatorSchema,
  conditions: z.array(conditionSchema)
});

// ══════════════════════════════════════════════════════════════════
//  1.4 显示/隐藏规则（User Story 1）
// ══════════════════════════════════════════════════════════════════

const visibilityActionSchema = z.enum(["show", "hide"]);

const visibilityRuleSchema = z.object({
  action: visibilityActionSchema,
  condition: conditionGroupSchema
});

const questionVisibilityConfigSchema = z.object({
  baseVisibility: z.enum(["visible", "hidden"]),
  rules: z.array(visibilityRuleSchema)
});

// ══════════════════════════════════════════════════════════════════
//  1.5 跳转规则（User Story 2）
// ══════════════════════════════════════════════════════════════════

/**
 * JumpTarget 在 TS 类型中 targetKey 为可选字段，但语义上 type === "question" 时必填，
 * 此处用 discriminatedUnion 在 Schema 层面强制该不变量，属于对 TS 类型的合理运行时加固，
 * 不改变 JumpTarget 的字段形状（仍是 { type, targetKey? }）
 */
const jumpTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("question"),
    targetKey: clientKeySchema
  }),
  z.object({
    type: z.literal("endSurvey"),
    targetKey: clientKeySchema.optional()
  })
]);

const jumpRuleSchema = z.object({
  condition: conditionGroupSchema,
  target: jumpTargetSchema
});

const questionJumpConfigSchema = z.object({
  rules: z.array(jumpRuleSchema)
});

// ══════════════════════════════════════════════════════════════════
//  1.6 选项依赖映射（User Story 3）
// ══════════════════════════════════════════════════════════════════

const optionDependencyMappingSchema = z.object({
  dependsOnKey: clientKeySchema,
  optionsByAnswer: z.record(z.string(), z.array(z.string())),
  emptyStrategy: z.enum(["empty", "promptFillDependency"])
});

// ══════════════════════════════════════════════════════════════════
//  1.7 派生计算字段（User Story 4）
// ══════════════════════════════════════════════════════════════════

const computedFieldFormulaSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sum"),
    sourceKeys: z.array(clientKeySchema).min(1, "sum 公式至少需要一个参与题目")
  }),
  z.object({
    kind: z.literal("weightedSum"),
    sources: z
      .array(
        z.object({
          key: clientKeySchema,
          weight: z.number()
        })
      )
      .min(1, "weightedSum 公式至少需要一个参与题目")
  })
]);

const computedFieldConfigSchema = z.object({
  formula: computedFieldFormulaSchema,
  incompleteStrategy: z.enum(["treatAsZero", "skipCalculation"]),
  visibleToFiller: z.boolean()
});

// ══════════════════════════════════════════════════════════════════
//  1.8 单题目的完整逻辑配置容器
// ══════════════════════════════════════════════════════════════════

/** 与 QuestionLogicConfig 完全一致：四种能力互相独立、均可选 */
export const questionLogicConfigSchema = z.object({
  visibility: questionVisibilityConfigSchema.optional(),
  jump: questionJumpConfigSchema.optional(),
  optionDependency: optionDependencyMappingSchema.optional(),
  computedField: computedFieldConfigSchema.optional()
});

// ══════════════════════════════════════════════════════════════════
//  导出类型（供 Service 层复用）
// ══════════════════════════════════════════════════════════════════

export type QuestionLogicConfigInput = z.infer<typeof questionLogicConfigSchema>;
