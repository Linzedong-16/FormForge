// ──────────────────────────────────────────────────────────────────────────────
// 动态表单引擎 —— 规则类型系统
// 对应 specs/008-dynamic-form-engine/data-model.md §1
// 本文件为纯类型 + 函数签名声明（declare function），不含运行时实现，
// 具体求值/校验/规范化算法分别落地在 normalize.ts / evaluator.ts / validator.ts
// ──────────────────────────────────────────────────────────────────────────────

import type { Material } from "../types/material.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 1.1 基础引用与比较运算符
// ═══════════════════════════════════════════════════════════════════════════════

/** 稳定题目引用键，对应 SurveyComponent.client_key，规则内一律用它引用题目，不用 component_id/order_index */
export type ClientKey = string;

/** 比较运算符：覆盖显示/隐藏、跳转等规则条件所需的等于/不等于/包含/大小比较/空值判定场景 */
export type ComparisonOperator =
  | "eq" // 等于
  | "neq" // 不等于
  | "contains" // 包含（text-list 语义：数组包含某文本；text 语义：子串包含）
  | "notContains"
  | "gt" // 大于（number 语义）
  | "gte"
  | "lt"
  | "lte"
  | "isEmpty" // 未作答/空值
  | "isNotEmpty";

/** 条件组的组合方式 */
export type LogicCombinator = "AND" | "OR";

// ═══════════════════════════════════════════════════════════════════════════════
// 1.2 答案值规范化
// ═══════════════════════════════════════════════════════════════════════════════

/** 原始运行时答案值：现有 14 种题型的异构存储形态，仅用于 normalizeAnswerValue 的输入 */
export type RawAnswerValue =
  | string
  | number
  | string[]
  | Date
  | Record<number, number> // 矩阵题：行索引 → 列索引
  | null
  | undefined;

/** 规范化后的答案值：条件比较运算符只对这个联合类型操作，不感知具体题型 */
export type NormalizedValue =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "text-list"; value: string[] }
  | { kind: "matrix"; value: Record<string, number> }
  | { kind: "empty" }; // 未作答，区别于空字符串/空数组，用于 isEmpty/isNotEmpty 判定

/**
 * 将某题目的原始答案值规范化为统一比较形态。
 * single-select 分支显式将存储的选项索引转换为对应选项的文本值，
 * 与 option-select/multi-select 保持一致语义（不修复底层存储，只在此层规范化）。
 */
export declare function normalizeAnswerValue(
  material: Material,
  rawValue: RawAnswerValue,
  comConfig: unknown
): NormalizedValue;

// ═══════════════════════════════════════════════════════════════════════════════
// 1.3 单条条件与条件组（Condition Group）
// ═══════════════════════════════════════════════════════════════════════════════

/** 单条比较条件：以某题目当前答案与给定值比较 */
export interface Condition {
  /** 条件依据的题目（必须是同一问卷内、先于当前作用目标出现的题目） */
  sourceKey: ClientKey;
  operator: ComparisonOperator;
  /** 比较值；isEmpty/isNotEmpty 时忽略该字段 */
  value?: string | number | string[];
}

/** 条件组：一组 Condition 以 AND/OR 组合 */
export interface ConditionGroup {
  combinator: LogicCombinator;
  conditions: Condition[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1.4 显示/隐藏规则（User Story 1，含 baseVisibility 冲突裁决模型）
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 设计说明：为同时表达"默认隐藏，满足条件才显示"与"默认显示，满足条件才隐藏"两种
 * 主流问卷工具的常见配置模式，`QuestionVisibilityConfig` 引入 baseVisibility 字段作为
 * 无规则命中时的默认态，再叠加一组带方向（show/hide）的规则；最终可见性按固定顺序解析：
 * 任一 hide 规则命中 → 隐藏；否则任一 show 规则命中 → 显示；否则 → baseVisibility（隐藏优先胜出）。
 */
export type VisibilityAction = "show" | "hide";

export interface VisibilityRule {
  action: VisibilityAction;
  condition: ConditionGroup;
}

export interface QuestionVisibilityConfig {
  /** 无规则命中时的默认可见性；默认 "visible" */
  baseVisibility: "visible" | "hidden";
  /** 按 action 分别可配置多条规则；裁决顺序见上方类型说明 */
  rules: VisibilityRule[];
}

/**
 * 解析题目最终可见性。
 * 隐藏优先胜出：只要有一条 hide 规则命中即隐藏。
 */
export declare function resolveVisibility(
  config: QuestionVisibilityConfig | undefined,
  answers: Record<ClientKey, NormalizedValue>
): "visible" | "hidden";

// ═══════════════════════════════════════════════════════════════════════════════
// 1.5 跳转规则（User Story 2）
// ═══════════════════════════════════════════════════════════════════════════════

export type JumpTargetType = "question" | "endSurvey";

export interface JumpTarget {
  type: JumpTargetType;
  /** type === "question" 时必填，指向跳转目标题目 */
  targetKey?: ClientKey;
}

export interface JumpRule {
  condition: ConditionGroup;
  target: JumpTarget;
}

export interface QuestionJumpConfig {
  /** 按配置顺序排列；同时满足触发条件时取第一条命中规则生效（first-match-wins） */
  rules: JumpRule[];
}

/** 返回第一条条件命中的跳转规则，无命中时返回 null（表示不跳转，走顺序下一题） */
export declare function resolveJump(
  config: QuestionJumpConfig | undefined,
  answers: Record<ClientKey, NormalizedValue>
): JumpRule | null;

// ═══════════════════════════════════════════════════════════════════════════════
// 1.6 选项依赖映射（User Story 3）
// ═══════════════════════════════════════════════════════════════════════════════

/** 某题目的候选选项集合依赖另一题目的具体答案值 */
export interface OptionDependencyMapping {
  /** 被依赖的题目（联动的答案来源） */
  dependsOnKey: ClientKey;
  /** 依赖题目的答案值 → 本题目候选选项值集合 */
  optionsByAnswer: Record<string, string[]>;
  /** dependsOnKey 尚未作答时，本题目候选集合的展示策略 */
  emptyStrategy: "empty" | "promptFillDependency";
}

/**
 * 求解某题目当前应展示的候选选项集合。
 * 若依赖题目答案变化导致已选值不再属于新候选集合，调用方须清空该题已选值。
 */
export declare function resolveOptionPool(
  mapping: OptionDependencyMapping,
  answers: Record<ClientKey, NormalizedValue>
): string[] | { prompt: true };

// ═══════════════════════════════════════════════════════════════════════════════
// 1.7 派生计算字段（User Story 4）
// ═══════════════════════════════════════════════════════════════════════════════

export type ComputedFieldFormula =
  | { kind: "sum"; sourceKeys: ClientKey[] }
  | { kind: "weightedSum"; sources: Array<{ key: ClientKey; weight: number }> };

export interface ComputedFieldConfig {
  formula: ComputedFieldFormula;
  /** 参与计算的题目未全部作答时的降级策略；默认 "treatAsZero" */
  incompleteStrategy: "treatAsZero" | "skipCalculation";
  /** 计算结果是否对填写者可见展示（只读） */
  visibleToFiller: boolean;
}

/** 计算结果为 null 表示因 incompleteStrategy === "skipCalculation" 而未产出值 */
export declare function computeDerivedField(
  config: ComputedFieldConfig,
  answers: Record<ClientKey, NormalizedValue>
): number | null;

// ═══════════════════════════════════════════════════════════════════════════════
// 1.8 单题目的完整逻辑配置容器
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SurveyComponent.logic 列反序列化后的类型；对应"逻辑规则"顶层容器。
 * 四种能力互相独立、均可选，一个题目可以同时配置多种（如既是跳转来源又是联动目标）。
 */
export interface QuestionLogicConfig {
  visibility?: QuestionVisibilityConfig;
  jump?: QuestionJumpConfig;
  optionDependency?: OptionDependencyMapping;
  /** 仅当该题目本身是 "computed-field" 伪题型（Material 联合类型的字符串字面量）时存在 */
  computedField?: ComputedFieldConfig;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1.9 发布时规则校验结果（User Story 5）
// ═══════════════════════════════════════════════════════════════════════════════

export type RuleViolationType =
  | "circularDependency"
  | "danglingReference"
  | "invalidJumpTarget"
  | "staleOptionReference";

export interface RuleViolation {
  type: RuleViolationType;
  /** 涉及的题目 client_key，circularDependency 时为环上全部题目 */
  involvedKeys: ClientKey[];
  message: string;
}

export interface RuleValidationResult {
  valid: boolean;
  violations: RuleViolation[];
}

/**
 * 对整份问卷的全部题目 logic 配置做完整性校验：
 * - circularDependency：以"规则来源题目 → 目标题目"为有向边，DFS 三色标记法检测环
 * - danglingReference：sourceKey/targetKey 不在当前题目集合（client_key 全集）中
 * - invalidJumpTarget：跳转目标为自身，或目标 order_index 不晚于来源（仅支持向后跳转）
 * - staleOptionReference（best-effort，FR-008）：optionDependency.optionsByAnswer 的答案分支
 *   引用了依赖题目已不存在的选项值；仅当调用方传入 validOptionsByKey 时才启用该检测，
 *   省略该参数时行为与本能力落地前完全一致
 * @param validOptionsByKey 题目当前有效选项值集合（clientKey → 有效选项值数组），可选
 */
export declare function validateRuleSet(
  components: Array<{ clientKey: ClientKey; orderIndex: number; logic: QuestionLogicConfig | null }>,
  validOptionsByKey?: Record<ClientKey, string[]>
): RuleValidationResult;
