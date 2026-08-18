// ──────────────────────────────────────────────────────────────────────────────
// 动态表单引擎 —— 规则求值算法
// 对应 specs/008-dynamic-form-engine/tasks.md T018（resolveVisibility）/ T027（resolveJump）/
// T033（resolveOptionPool）/ T038（computeDerivedField）
//
// 迁移说明（T021，原路径 src/logic/evaluator.ts）：仅调整相对 import 路径迁移至
// core/logic/，本身只依赖同目录的 ./types（纯类型），算法与行为不变
// ──────────────────────────────────────────────────────────────────────────────

import type {
  ClientKey,
  Condition,
  ConditionGroup,
  ComputedFieldConfig,
  JumpRule,
  NormalizedValue,
  OptionDependencyMapping,
  QuestionJumpConfig,
  QuestionVisibilityConfig
} from "./types";

/**
 * 求值单条比较条件。
 * 设计原则：任何"运算符与 NormalizedValue.kind 不匹配"或"sourceKey 引用的题目不存在/未作答"
 * 的组合均安全兜底为不命中（false），不抛异常——规则求值运行在填写页的实时响应链路上，
 * 一次异常不应阻断整份问卷的渲染。
 */
function evalCondition(condition: Condition, answers: Record<ClientKey, NormalizedValue>): boolean {
  const normalized: NormalizedValue = answers[condition.sourceKey] ?? { kind: "empty" };

  // isEmpty/isNotEmpty 是唯二不依赖 condition.value、且对全部 kind 通用的运算符
  if (condition.operator === "isEmpty") return normalized.kind === "empty";
  if (condition.operator === "isNotEmpty") return normalized.kind !== "empty";

  // 未作答题目对其余运算符始终不命中：没有值可比较
  if (normalized.kind === "empty") return false;

  switch (normalized.kind) {
    case "text":
      return evalTextCondition(condition, normalized.value);
    case "number":
      return evalNumberCondition(condition, normalized.value);
    case "text-list":
      return evalTextListCondition(condition, normalized.value);
    case "matrix":
      // matrix 仅支持上方已处理的 isEmpty/isNotEmpty，其余比较对矩阵题无明确语义
      return false;
  }
}

/** text kind：eq/neq 全等比较，contains/notContains 子串包含，gt/gte/lt/lte 复用字符串字典序（日期 ISO 字符串比较） */
function evalTextCondition(condition: Condition, actual: string): boolean {
  const expected = condition.value;
  if (typeof expected !== "string") return false;

  switch (condition.operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "contains":
      return actual.includes(expected);
    case "notContains":
      return !actual.includes(expected);
    case "gt":
      return actual > expected;
    case "gte":
      return actual >= expected;
    case "lt":
      return actual < expected;
    case "lte":
      return actual <= expected;
    default:
      return false;
  }
}

/** number kind：仅支持数值比较运算符，不支持 contains 类文本语义 */
function evalNumberCondition(condition: Condition, actual: number): boolean {
  const expected = condition.value;
  if (typeof expected !== "number") return false;

  switch (condition.operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return actual > expected;
    case "gte":
      return actual >= expected;
    case "lt":
      return actual < expected;
    case "lte":
      return actual <= expected;
    default:
      return false;
  }
}

/** text-list kind：仅支持 contains/notContains（"是否选中某选项"），不支持大小比较 */
function evalTextListCondition(condition: Condition, actual: string[]): boolean {
  const expected = condition.value;
  if (typeof expected !== "string") return false;

  switch (condition.operator) {
    case "contains":
      return actual.includes(expected);
    case "notContains":
      return !actual.includes(expected);
    default:
      return false;
  }
}

/** 条件组求值：AND 要求全部条件命中，OR 要求任一条件命中（空数组：AND 恒真、OR 恒假，标准逻辑语义） */
function evalConditionGroup(group: ConditionGroup, answers: Record<ClientKey, NormalizedValue>): boolean {
  if (group.combinator === "AND") {
    return group.conditions.every(condition => evalCondition(condition, answers));
  }
  return group.conditions.some(condition => evalCondition(condition, answers));
}

/**
 * 解析题目最终可见性（FR-002/Clarification Q2：隐藏优先胜出）。
 * 裁决顺序：任一 hide 规则命中 → hidden；否则任一 show 规则命中 → visible；否则 → baseVisibility。
 */
export function resolveVisibility(
  config: QuestionVisibilityConfig | undefined,
  answers: Record<ClientKey, NormalizedValue>
): "visible" | "hidden" {
  if (!config) return "visible";

  const hideHit = config.rules.some(rule => rule.action === "hide" && evalConditionGroup(rule.condition, answers));
  if (hideHit) return "hidden";

  const showHit = config.rules.some(rule => rule.action === "show" && evalConditionGroup(rule.condition, answers));
  if (showHit) return "visible";

  return config.baseVisibility;
}

/**
 * 解析下一题跳转目标（FR-003：first-match-wins）。
 * 按配置顺序遍历规则，返回第一条条件命中的规则；全部不命中时返回 null，表示不跳转、走顺序下一题。
 */
export function resolveJump(
  config: QuestionJumpConfig | undefined,
  answers: Record<ClientKey, NormalizedValue>
): JumpRule | null {
  if (!config) return null;

  return config.rules.find(rule => evalConditionGroup(rule.condition, answers)) ?? null;
}

/**
 * 求解某题目当前应展示的候选选项集合（FR-004）。
 * 依赖题目未作答（或已作答但被清空为 empty）时按 emptyStrategy 降级：
 * "empty" 返回空候选集合；"promptFillDependency" 返回提示占位，交由 UI 引导填写者先填依赖题。
 * 依赖题目答案值未命中映射表、或答案类型不是 text（单选题规范化后的形态）时，
 * 安全兜底为空候选集合，不抛异常——与其余求值函数保持一致的降级原则。
 */
export function resolveOptionPool(
  mapping: OptionDependencyMapping,
  answers: Record<ClientKey, NormalizedValue>
): string[] | { prompt: true } {
  const normalized: NormalizedValue = answers[mapping.dependsOnKey] ?? { kind: "empty" };

  if (normalized.kind === "empty") {
    return mapping.emptyStrategy === "promptFillDependency" ? { prompt: true } : [];
  }
  if (normalized.kind !== "text") return [];

  return mapping.optionsByAnswer[normalized.value] ?? [];
}

/**
 * 提取某题目答案的数值形态：未作答（answers 中无此 key）、显式清空（kind: "empty"）、
 * 或答案类型非 number（如误配置为文本题）均统一视为"未作答"，返回 undefined 交由调用方按 incompleteStrategy 降级
 */
function extractNumericAnswer(key: ClientKey, answers: Record<ClientKey, NormalizedValue>): number | undefined {
  const normalized = answers[key];
  return normalized?.kind === "number" ? normalized.value : undefined;
}

/**
 * 计算派生字段（FR-005）。
 * sum/weightedSum 两种公式统一按"参与题目逐一取值累加/加权累加"处理；只要有一个参与题目未作答，
 * 按 incompleteStrategy 降级：treatAsZero 将其视为 0 继续参与计算，skipCalculation 直接返回 null 不产出结果，
 * 交由调用方（填写页/编辑器预览）决定"不产出结果"时的展示态（如置空/隐藏），本函数不涉及 UI 呈现。
 */
export function computeDerivedField(
  config: ComputedFieldConfig,
  answers: Record<ClientKey, NormalizedValue>
): number | null {
  const sourceKeys =
    config.formula.kind === "sum" ? config.formula.sourceKeys : config.formula.sources.map(source => source.key);
  const hasIncompleteSource = sourceKeys.some(key => extractNumericAnswer(key, answers) === undefined);
  if (hasIncompleteSource && config.incompleteStrategy === "skipCalculation") return null;

  if (config.formula.kind === "sum") {
    return config.formula.sourceKeys.reduce((total, key) => total + (extractNumericAnswer(key, answers) ?? 0), 0);
  }
  return config.formula.sources.reduce(
    (total, source) => total + source.weight * (extractNumericAnswer(source.key, answers) ?? 0),
    0
  );
}
