// ──────────────────────────────────────────────────────────────────────────────
// 兼容 Shim —— 保留外部深度导入路径 monorepo-survey-engine/logic/types.js
//
// 背景：package.json 的 exports 通配符（"./*": "./src/*"）允许外部包直接深度导入本包内部路径。
// 经全仓库排查，app/q-server（survey-crud.service.ts、survey-rule.service.ts）与
// packages/common（survey.interface.ts）均通过该路径导入 QuestionLogicConfig 等类型。
// 本文件的实际内容已迁移至 core/logic/types.ts（T020，切断到 vue 的 type-only 依赖链），
// 此处仅做整体再导出，供外部消费方无感升级，不再包含任何实现细节。
// ──────────────────────────────────────────────────────────────────────────────

export type {
  ClientKey,
  ComparisonOperator,
  LogicCombinator,
  RawAnswerValue,
  NormalizedValue,
  Condition,
  ConditionGroup,
  VisibilityAction,
  VisibilityRule,
  QuestionVisibilityConfig,
  JumpTargetType,
  JumpTarget,
  JumpRule,
  QuestionJumpConfig,
  OptionDependencyMapping,
  ComputedFieldFormula,
  ComputedFieldConfig,
  QuestionLogicConfig,
  RuleViolationType,
  RuleViolation,
  RuleValidationResult
} from "../core/logic/types.js";
