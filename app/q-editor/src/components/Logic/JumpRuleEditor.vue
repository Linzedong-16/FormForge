<template>
  <div class="jump-rule-editor">
    <!-- 是否为当前题目启用跳转规则；关闭时 modelValue 整体为 null，与"未配置"语义对齐 -->
    <div class="flex align-items-center mb-10">
      <span class="mr-10">{{ t("logic.jumpSection") }}</span>
      <el-switch :model-value="isEnabled" @update:model-value="onToggleEnabled" />
    </div>

    <template v-if="config">
      <el-text v-if="jumpTargets.length === 0" type="warning" size="small" class="mb-10 block-text">
        {{ t("logic.noAvailableJumpTarget") }}
      </el-text>

      <div v-for="(rule, index) in config.rules" :key="index" class="jump-rule-row mb-10">
        <ConditionGroupEditor
          :model-value="rule.condition"
          :sources="conditionSources"
          @update:model-value="(val: ConditionGroup) => onRuleConditionChange(index, val)"
        />

        <div class="flex align-items-center mb-10 mt-10">
          <span class="mr-10">{{ t("logic.jumpTargetSection") }}</span>
          <el-radio-group
            :model-value="rule.target.type"
            size="small"
            class="mr-10"
            @update:model-value="(val: JumpTargetType) => onRuleTargetTypeChange(index, val)"
          >
            <el-radio-button label="question" :disabled="jumpTargets.length === 0">{{
              t("logic.jumpTargetQuestion")
            }}</el-radio-button>
            <el-radio-button label="endSurvey">{{ t("logic.jumpTargetEndSurvey") }}</el-radio-button>
          </el-radio-group>

          <el-select
            v-if="rule.target.type === 'question'"
            :model-value="rule.target.targetKey"
            :placeholder="t('logic.selectTargetQuestion')"
            class="mr-10 jump-target-select"
            @update:model-value="(val: string) => onRuleTargetKeyChange(index, val)"
          >
            <el-option
              v-for="target in jumpTargets"
              :key="target.clientKey"
              :label="target.label"
              :value="target.clientKey"
            />
          </el-select>

          <el-button type="danger" size="small" circle :icon="Minus" @click="removeRule(index)" />
        </div>
      </div>

      <el-button size="small" :icon="Plus" :disabled="conditionSources.length === 0" @click="addRule">{{
        t("logic.addRule")
      }}</el-button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, Minus } from "@element-plus/icons-vue";
import type { ClientKey, ConditionGroup, JumpRule, JumpTargetType, QuestionJumpConfig } from "monorepo-survey-engine";
import type { ConditionSourceOption, JumpTargetOption } from "./logicSources";
import ConditionGroupEditor from "./ConditionGroupEditor.vue";

const { t } = useI18n();

const props = defineProps<{
  modelValue: QuestionJumpConfig | null | undefined;
  conditionSources: ConditionSourceOption[];
  jumpTargets: JumpTargetOption[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: QuestionJumpConfig | null): void;
}>();

const isEnabled = computed(() => !!props.modelValue);
// 未启用时 config 为 null，模板据此隐藏规则列表区域
const config = computed(() => props.modelValue ?? null);

/** 新建规则的默认跳转目标：有可用后续题目时默认跳到第一个，否则只能默认直接结束问卷 */
function defaultTarget(): JumpRule["target"] {
  const firstTarget = props.jumpTargets[0];
  return firstTarget ? { type: "question", targetKey: firstTarget.clientKey } : { type: "endSurvey" };
}

function onToggleEnabled(enabled: boolean) {
  if (enabled) {
    emit("update:modelValue", { rules: [] });
  } else {
    emit("update:modelValue", null);
  }
}

function onRuleConditionChange(index: number, condition: ConditionGroup) {
  if (!config.value) return;
  const rules = config.value.rules.map((rule, i) => (i === index ? { ...rule, condition } : rule));
  emit("update:modelValue", { ...config.value, rules });
}

// 切换跳转目标类型：question → 默认取第一个可用目标题目；endSurvey 不需要 targetKey
function onRuleTargetTypeChange(index: number, type: JumpTargetType) {
  if (!config.value) return;
  const target: JumpRule["target"] = type === "question" ? defaultTarget() : { type: "endSurvey" };
  const rules = config.value.rules.map((rule, i) => (i === index ? { ...rule, target } : rule));
  emit("update:modelValue", { ...config.value, rules });
}

function onRuleTargetKeyChange(index: number, targetKey: ClientKey) {
  if (!config.value) return;
  const rules = config.value.rules.map((rule, i) =>
    i === index ? { ...rule, target: { type: "question" as const, targetKey } } : rule
  );
  emit("update:modelValue", { ...config.value, rules });
}

function addRule() {
  if (!config.value) return;
  const defaultSource = props.conditionSources[0];
  if (!defaultSource) return;
  const newRule: JumpRule = { condition: { combinator: "AND", conditions: [] }, target: defaultTarget() };
  emit("update:modelValue", { ...config.value, rules: [...config.value.rules, newRule] });
}

function removeRule(index: number) {
  if (!config.value) return;
  const rules = config.value.rules.filter((_, i) => i !== index);
  emit("update:modelValue", { ...config.value, rules });
}
</script>

<style scoped lang="scss">
.jump-rule-row {
  padding: 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}
.jump-target-select {
  width: 160px;
}
.block-text {
  display: block;
}
</style>
