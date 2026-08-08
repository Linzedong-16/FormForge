<template>
  <div class="logic-panel-container">
    <el-divider>{{ t("logic.panelTitle") }}</el-divider>
    <!-- 持久提示：题目自身规则引用的题目已被删除（FR-009），常驻展示直至设计者手动修正，不因面板重渲染而消失 -->
    <el-alert
      v-if="danglingReferences.length > 0"
      type="warning"
      :closable="false"
      show-icon
      class="dangling-reference-alert"
    >
      <template #title>{{ t("logic.danglingReferenceTitle") }}</template>
      <div v-for="violation in danglingReferences" :key="violation.message">{{ violation.message }}</div>
    </el-alert>
    <VisibilityRuleEditor
      :model-value="com.logic?.visibility ?? null"
      :sources="sources"
      @update:model-value="onVisibilityChange"
    />
    <el-divider />
    <JumpRuleEditor
      :model-value="com.logic?.jump ?? null"
      :condition-sources="sources"
      :jump-targets="jumpTargets"
      @update:model-value="onJumpChange"
    />
    <template v-if="targetOptions">
      <el-divider />
      <OptionDependencyEditor
        :model-value="com.logic?.optionDependency ?? null"
        :sources="optionDependencySources"
        :target-options="targetOptions"
        @update:model-value="onOptionDependencyChange"
      />
    </template>
    <!-- 计算字段是 "computed-field" 题目本身的核心配置，与前三种可叠加的规则相互独立、可共存 -->
    <template v-if="com.name === 'computed-field'">
      <el-divider />
      <ComputedFieldEditor
        :model-value="com.logic?.computedField ?? null"
        :sources="computedFieldSources"
        @update:model-value="onComputedFieldChange"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type {
  ComputedFieldConfig,
  OptionDependencyMapping,
  QuestionJumpConfig,
  QuestionLogicConfig,
  QuestionVisibilityConfig
} from "monorepo-survey-engine";
import type { Status } from "@/types";
import { useEditorStore } from "@/stores/useEditor";
import {
  getAvailableComputedFieldSources,
  getAvailableConditionSources,
  getAvailableJumpTargets,
  getAvailableOptionDependencySources,
  getOptionTexts
} from "./logicSources";
import VisibilityRuleEditor from "./VisibilityRuleEditor.vue";
import JumpRuleEditor from "./JumpRuleEditor.vue";
import OptionDependencyEditor from "./OptionDependencyEditor.vue";
import ComputedFieldEditor from "./ComputedFieldEditor.vue";

const { t } = useI18n();
const store = useEditorStore();

const props = defineProps<{
  com: Status;
  index: number;
}>();

// 条件来源题目只能取自当前题目之前的题目，与填写时的作答顺序保持一致
const sources = computed(() => getAvailableConditionSources(store.coms, props.index));
// 跳转目标只能取自当前题目之后的题目，遵循"仅支持向后跳转"的业务约束（spec.md Assumptions）
const jumpTargets = computed(() => getAvailableJumpTargets(store.coms, props.index));
// 选项联动依赖题目同样只能取自当前题目之前的题目，且要求依赖题答案可规范化为 text
const optionDependencySources = computed(() => getAvailableOptionDependencySources(store.coms, props.index));
// 仅当前题目自身是"选择类题型"（拥有纯字符串选项列表）时，才展示选项联动配置入口（T035）
const targetOptions = computed(() => getOptionTexts(props.com));
// 计算字段参与计算的题目同样只能取自当前题目之前的题目，且要求为数值型题目（T040）
const computedFieldSources = computed(() => getAvailableComputedFieldSources(store.coms, props.index));
// 当前题目自身的规则是否引用了已被删除的题目（FR-009），持久展示直至设计者手动修正
const danglingReferences = computed(() =>
  props.com.client_key ? store.getDanglingReferencesFrom(props.com.client_key) : []
);

function onVisibilityChange(visibility: QuestionVisibilityConfig | null) {
  const clientKey = store.ensureComClientKey(props.index);
  if (!clientKey) return;
  const nextLogic: QuestionLogicConfig = { ...(props.com.logic ?? {}), visibility: visibility ?? undefined };
  // logic 全部子字段均为空时整体置 null，避免持久化无意义的空对象
  const hasAnyField = Object.values(nextLogic).some(value => value !== undefined && value !== null);
  store.setComLogicByClientKey(clientKey, hasAnyField ? nextLogic : null);
}

function onJumpChange(jump: QuestionJumpConfig | null) {
  const clientKey = store.ensureComClientKey(props.index);
  if (!clientKey) return;
  const nextLogic: QuestionLogicConfig = { ...(props.com.logic ?? {}), jump: jump ?? undefined };
  // logic 全部子字段均为空时整体置 null，避免持久化无意义的空对象
  const hasAnyField = Object.values(nextLogic).some(value => value !== undefined && value !== null);
  store.setComLogicByClientKey(clientKey, hasAnyField ? nextLogic : null);
}

function onOptionDependencyChange(optionDependency: OptionDependencyMapping | null) {
  const clientKey = store.ensureComClientKey(props.index);
  if (!clientKey) return;
  const nextLogic: QuestionLogicConfig = {
    ...(props.com.logic ?? {}),
    optionDependency: optionDependency ?? undefined
  };
  // logic 全部子字段均为空时整体置 null，避免持久化无意义的空对象
  const hasAnyField = Object.values(nextLogic).some(value => value !== undefined && value !== null);
  store.setComLogicByClientKey(clientKey, hasAnyField ? nextLogic : null);
}

function onComputedFieldChange(computedField: ComputedFieldConfig | null) {
  const clientKey = store.ensureComClientKey(props.index);
  if (!clientKey) return;
  const nextLogic: QuestionLogicConfig = { ...(props.com.logic ?? {}), computedField: computedField ?? undefined };
  // logic 全部子字段均为空时整体置 null，避免持久化无意义的空对象
  const hasAnyField = Object.values(nextLogic).some(value => value !== undefined && value !== null);
  store.setComLogicByClientKey(clientKey, hasAnyField ? nextLogic : null);
}
</script>

<style scoped lang="scss">
.logic-panel-container {
  padding: 0 30px 30px;
}

.dangling-reference-alert {
  margin-bottom: 16px;
}
</style>
