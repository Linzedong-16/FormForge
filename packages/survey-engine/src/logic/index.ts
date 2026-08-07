// ──────────────────────────────────────────────────────────────────────────────
// 动态表单引擎 logic 子模块 —— 统一导出入口
// 随各任务落地逐步补全：当前 normalizeAnswerValue（T005）/useRuleRuntime（T016）/resolveVisibility（T018）/
// resolveJump（T027）/resolveOptionPool（T033）/computeDerivedField（T038）/validateRuleSet（T044）
// 均已有真实实现
// ──────────────────────────────────────────────────────────────────────────────

export { normalizeAnswerValue } from "./normalize";
export { useRuleRuntime } from "./useRuleRuntime";
export type { RuleRuntimeComponent, UseRuleRuntimeOptions, UseRuleRuntimeReturn } from "./useRuleRuntime";
export { resolveVisibility, resolveJump, resolveOptionPool, computeDerivedField } from "./evaluator";
export { validateRuleSet } from "./validator";

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
} from "./types";
