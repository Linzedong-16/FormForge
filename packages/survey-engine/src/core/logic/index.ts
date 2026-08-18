// ──────────────────────────────────────────────────────────────────────────────
// core/logic 子模块 —— 统一导出入口（框架无关，可在 vitest.core.config.ts 下独立运行）
// useRuleRuntime 依赖 vue，不属于本目录，已迁移至 adapters/vue3/useRuleRuntime.ts（T024）
// ──────────────────────────────────────────────────────────────────────────────

export { normalizeAnswerValue } from "./normalize";
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
