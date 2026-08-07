// ──────────────────────────────────────────────────────────────────────────────
// 动态规则 —— 条件来源题目辅助函数
// 供 ConditionGroupEditor.vue（T019）及后续 JumpRuleEditor.vue（T028）复用
// ──────────────────────────────────────────────────────────────────────────────
import type { ClientKey } from "monorepo-survey-engine";
import type { Material, Status, TextProps, OptionsProps, OptionsStatus } from "@/types";
import { IsOptionsStatus, isStringArray } from "@/types";

/** 与 packages/survey-engine/src/logic/normalize.ts 的 NormalizedValue.kind 严格对齐（排除运行时态 "empty"） */
export type ConditionValueKind = "text" | "number" | "text-list" | "matrix";

/** 条件编辑器可选的"来源题目" */
export interface ConditionSourceOption {
  clientKey: ClientKey;
  label: string;
  valueKind: ConditionValueKind;
}

/**
 * 精确镜像 normalizeAnswerValue() 的 Material → NormalizedValue.kind 映射（packages/survey-engine/src/logic/normalize.ts）。
 * UI 层必须与引擎的真实规范化逻辑完全一致，否则会出现"配置成功但引擎运行时永不命中"的隐蔽 bug。
 * text-note 非真实题目，落入 normalize.ts 的 default 分支（恒为 empty），不作为可用来源；
 * computed-field 的计算结果由填写页写回 answers store 后同样规范化为 number（T041），可作为其余规则的数值来源。
 */
function getMaterialValueKind(material: Material): ConditionValueKind | null {
  switch (material) {
    case "single-select":
    case "personal-info-gender":
    case "personal-info-age":
    case "personal-info-education":
    case "personal-info-career":
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
    case "personal-info-position":
    case "date-time":
    case "personal-info-birth":
      return "text";
    case "multi-select":
    case "multi-pic-select":
    case "cascader":
    case "transfer":
      return "text-list";
    case "rate-score":
    case "slider":
      return "number";
    case "matrix-single":
      return "matrix";
    case "computed-field":
      return "number";
    default:
      return null;
  }
}

/** 跳转规则编辑器可选的"跳转目标题目"（T028，见下方 getAvailableJumpTargets） */
export interface JumpTargetOption {
  clientKey: ClientKey;
  label: string;
}

/** BaseStatus.title 始终为 TextProps（纯字符串），此处做运行时收窄以安全读取标题文本 */
function isTextProps(prop: TextProps | OptionsProps | undefined): prop is TextProps {
  return !!prop && typeof (prop as TextProps).status === "string";
}

/** 导出供 JumpRuleEditor.vue（T028）等复用，避免重复实现标题读取逻辑 */
export function getComTitle(com: Status): string {
  const titleProp = com.status.title;
  if (isTextProps(titleProp) && titleProp.status.trim()) {
    return titleProp.status;
  }
  return com.name;
}

/**
 * 计算某题目当前可用的"条件来源题目"列表。
 * Condition.sourceKey 约束：必须是同一问卷内、先于当前作用目标出现的题目（packages/survey-engine/src/logic/types.ts），
 * 因此只取 coms 数组中下标小于 currentIndex 的题目；同时要求题目已生成 client_key 且题型有明确的取值类型。
 */
export function getAvailableConditionSources(coms: Status[], currentIndex: number): ConditionSourceOption[] {
  const sources: ConditionSourceOption[] = [];
  for (const com of coms.slice(0, currentIndex)) {
    const valueKind = getMaterialValueKind(com.name);
    if (!com.client_key || !valueKind) continue;
    sources.push({ clientKey: com.client_key, label: getComTitle(com), valueKind });
  }
  return sources;
}

/**
 * 计算某题目当前可用的"跳转目标题目"列表（T028）。
 * 与 getAvailableConditionSources 方向相反：validateRuleSet 仅接受"向后跳转"（data-model.md §1.9
 * invalidJumpTarget 判定：跳转目标为自身，或目标 order_index 不晚于来源），因此只取 coms 数组中
 * 下标大于 currentIndex 的题目；不要求 valueKind（跳转目标不涉及条件比较，任意可展示的题目均可作为落点）。
 */
export function getAvailableJumpTargets(coms: Status[], currentIndex: number): JumpTargetOption[] {
  const targets: JumpTargetOption[] = [];
  for (const com of coms.slice(currentIndex + 1)) {
    if (!com.client_key) continue;
    targets.push({ clientKey: com.client_key, label: getComTitle(com) });
  }
  return targets;
}

/** 选项联动编辑器可选的"依赖题目"（T034，见下方 getAvailableOptionDependencySources） */
export interface OptionDependencySourceOption {
  clientKey: ClientKey;
  label: string;
  options: string[];
}

/**
 * 从题目的 status.options 中安全提取纯字符串选项列表。
 * 与 packages/survey-engine/src/logic/normalize.ts 的 extractOptionTexts() 语义一致：
 * 仅单选类题型（options.status 为 StringStatusArr）具备"选项文本"语义，
 * 其余形态（图文选项/级联树等）不适用于 OptionDependencyMapping.optionsByAnswer 的键值语义，直接排除。
 * 导出供 LogicPanel.vue（T035，判断当前题目是否"选择类题型"可配置选项联动入口）、
 * 选择类题目组件（T036，取当前题目自身选项文本作为 targetOptions）复用。
 */
export function getOptionTexts(com: Status): string[] | undefined {
  // Status.status 的索引签名类型为 { [key: string]: TextProps | OptionsProps }，与 IsOptionsStatus 期望的
  // BaseStatus 形状不完全一致，此处沿用 RightSide.vue 中既有的 as unknown as 收窄写法；
  // 后续访问必须使用收窄后的局部变量，直接访问 com.status.options 无法获得类型收窄
  const status = com.status as unknown as OptionsStatus;
  if (!IsOptionsStatus(status)) return undefined;
  const optionStatus = status.options.status;
  return isStringArray(optionStatus) ? optionStatus : undefined;
}

/**
 * 计算某题目当前可用的"选项联动依赖题目"列表（T034）。
 * 依赖方向与 getAvailableConditionSources 一致（仅取当前题目之前的题目），额外要求：
 * 1) valueKind 为 "text" —— 与 resolveOptionPool() 的求值语义对齐：依赖题答案必须能规范化为 NormalizedValue.kind === "text"；
 * 2) 题目自身存在非空的纯字符串选项列表 —— 只有单选类题型的选项文本可作为 optionsByAnswer 的键。
 */
export function getAvailableOptionDependencySources(
  coms: Status[],
  currentIndex: number
): OptionDependencySourceOption[] {
  const sources: OptionDependencySourceOption[] = [];
  for (const com of coms.slice(0, currentIndex)) {
    const valueKind = getMaterialValueKind(com.name);
    if (!com.client_key || valueKind !== "text") continue;
    const options = getOptionTexts(com);
    if (!options || options.length === 0) continue;
    sources.push({ clientKey: com.client_key, label: getComTitle(com), options });
  }
  return sources;
}

/** 计算字段公式编辑器可选的"参与计算题目"（T040，见下方 getAvailableComputedFieldSources） */
export interface ComputedFieldSourceOption {
  clientKey: ClientKey;
  label: string;
}

/**
 * 计算某"计算字段"题目当前可用的公式参与题目列表（T040）。
 * 依赖方向与 getAvailableConditionSources 一致（仅取当前题目之前的题目）；
 * 与 computeDerivedField() 的求值语义对齐：仅数值型题目（valueKind === "number"）的答案才能参与 sum/weightedSum 计算，
 * rate-score/slider 之外，computed-field 自身也返回 "number"（T041），因此排在前面的计算字段题目
 * 同样可作为后续计算字段的参与来源，支持链式计算；随后续新增数值题型时 getMaterialValueKind 的
 * "number" 分支会自动同步覆盖，此处无需改动。
 */
export function getAvailableComputedFieldSources(coms: Status[], currentIndex: number): ComputedFieldSourceOption[] {
  const sources: ComputedFieldSourceOption[] = [];
  for (const com of coms.slice(0, currentIndex)) {
    const valueKind = getMaterialValueKind(com.name);
    if (!com.client_key || valueKind !== "number") continue;
    sources.push({ clientKey: com.client_key, label: getComTitle(com) });
  }
  return sources;
}
