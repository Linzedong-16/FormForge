// ──────────────────────────────────────────────────────────────────────────────
// 动态表单引擎 —— 供 Vue 侧使用的规则运行时 composable
// 对应 specs/008-dynamic-form-engine/tasks.md T016
//
// 设计说明（薄骨架）：
//   本文件只落地全部用户故事共用的"答案规范化"这一计算环节（normalizeAnswerValue 已在 T005 实现）。
//   resolveVisibility（T018）/resolveJump（T027）/resolveOptionPool（T033）/computeDerivedField（T038）
//   届时均以 `normalizedAnswers` 为输入，各自在调用处以 computed(() => resolveXxx(logic, normalizedAnswers.value))
//   的形式接入，无需回头改动本文件——避免此处提前依赖尚未落地的 declare function（types.ts 中仅为类型契约）。
// ──────────────────────────────────────────────────────────────────────────────

import { computed } from "vue";
import type { ComputedRef, Ref } from "vue";
import type { Material } from "../types/material";
import { normalizeAnswerValue } from "./normalize";
import type { ClientKey, NormalizedValue, RawAnswerValue } from "./types";

/** 单个题目参与规则求值所需的最小上下文，不感知具体 UI 组件形态 */
export interface RuleRuntimeComponent {
  /** 稳定引用键，对应 SurveyComponent.client_key */
  clientKey: ClientKey;
  /** 题型，决定 normalizeAnswerValue 的分支语义 */
  material: Material;
  /** 题目自身配置（如选项列表），single-select 等分支需要它还原选项文本值 */
  comConfig: unknown;
}

export interface UseRuleRuntimeOptions {
  /** 问卷全部题目的规则求值上下文，响应式，随编辑器画布/填写页题目列表变化 */
  components: Ref<RuleRuntimeComponent[]> | ComputedRef<RuleRuntimeComponent[]>;
  /** 集中式答案 store（响应式），即 SurveyView.vue 中以 ClientKey 为键的 answers ref（T015） */
  answers: Ref<Record<ClientKey, RawAnswerValue>>;
}

export interface UseRuleRuntimeReturn {
  /** 全部题目的规范化答案；显示/隐藏、跳转、选项联动、计算字段求值统一以此为输入，避免重复规范化 */
  normalizedAnswers: ComputedRef<Record<ClientKey, NormalizedValue>>;
}

/**
 * 规则运行时组合式函数：集中管理"原始答案 → 规范化答案"的响应式计算，
 * 供后续用户故事各自接入具体求值函数（resolveVisibility/resolveJump/resolveOptionPool/computeDerivedField）。
 */
export function useRuleRuntime(options: UseRuleRuntimeOptions): UseRuleRuntimeReturn {
  const { components, answers } = options;

  const normalizedAnswers = computed<Record<ClientKey, NormalizedValue>>(() => {
    const result: Record<ClientKey, NormalizedValue> = {};
    for (const com of components.value) {
      result[com.clientKey] = normalizeAnswerValue(com.material, answers.value[com.clientKey], com.comConfig);
    }
    return result;
  });

  return { normalizedAnswers };
}
