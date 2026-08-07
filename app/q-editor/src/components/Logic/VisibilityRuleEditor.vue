<template>
  <div class="visibility-rule-editor">
    <!-- 是否为当前题目启用显示/隐藏条件；关闭时 modelValue 整体为 null，与"未配置"语义对齐 -->
    <div class="flex align-items-center mb-10">
      <span class="mr-10">{{ t("logic.visibilitySection") }}</span>
      <el-switch :model-value="isEnabled" @update:model-value="onToggleEnabled" />
    </div>

    <template v-if="config">
      <div class="flex align-items-center mb-10">
        <span class="mr-10">{{ t("logic.baseVisibility") }}</span>
        <el-radio-group :model-value="config.baseVisibility" size="small" @update:model-value="onBaseVisibilityChange">
          <el-radio-button label="visible">{{ t("logic.baseVisibilityVisible") }}</el-radio-button>
          <el-radio-button label="hidden">{{ t("logic.baseVisibilityHidden") }}</el-radio-button>
        </el-radio-group>
      </div>

      <div v-for="(rule, index) in config.rules" :key="index" class="visibility-rule-row mb-10">
        <div class="flex align-items-center mb-10">
          <el-radio-group
            :model-value="rule.action"
            size="small"
            class="mr-10"
            @update:model-value="(val: VisibilityAction) => onRuleActionChange(index, val)"
          >
            <el-radio-button label="show">{{ t("logic.ruleActionShow") }}</el-radio-button>
            <el-radio-button label="hide">{{ t("logic.ruleActionHide") }}</el-radio-button>
          </el-radio-group>
          <el-button type="danger" size="small" circle :icon="Minus" @click="removeRule(index)" />
        </div>
        <ConditionGroupEditor
          :model-value="rule.condition"
          :sources="sources"
          @update:model-value="(val: ConditionGroup) => onRuleConditionChange(index, val)"
        />
      </div>

      <el-button size="small" :icon="Plus" :disabled="sources.length === 0" @click="addRule">{{
        t("logic.addRule")
      }}</el-button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, Minus } from "@element-plus/icons-vue";
import type {
  ConditionGroup,
  QuestionVisibilityConfig,
  VisibilityAction,
  VisibilityRule
} from "monorepo-survey-engine";
import type { ConditionSourceOption } from "./logicSources";
import ConditionGroupEditor from "./ConditionGroupEditor.vue";

const { t } = useI18n();

const props = defineProps<{
  modelValue: QuestionVisibilityConfig | null | undefined;
  sources: ConditionSourceOption[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: QuestionVisibilityConfig | null): void;
}>();

const isEnabled = computed(() => !!props.modelValue);
// 未启用时 config 为 null，模板据此隐藏 baseVisibility/规则列表区域
const config = computed(() => props.modelValue ?? null);

function onToggleEnabled(enabled: boolean) {
  if (enabled) {
    emit("update:modelValue", { baseVisibility: "visible", rules: [] });
  } else {
    emit("update:modelValue", null);
  }
}

function onBaseVisibilityChange(baseVisibility: "visible" | "hidden") {
  if (!config.value) return;
  emit("update:modelValue", { ...config.value, baseVisibility });
}

function onRuleActionChange(index: number, action: VisibilityAction) {
  if (!config.value) return;
  const rules = config.value.rules.map((rule, i) => (i === index ? { ...rule, action } : rule));
  emit("update:modelValue", { ...config.value, rules });
}

function onRuleConditionChange(index: number, condition: ConditionGroup) {
  if (!config.value) return;
  const rules = config.value.rules.map((rule, i) => (i === index ? { ...rule, condition } : rule));
  emit("update:modelValue", { ...config.value, rules });
}

function addRule() {
  if (!config.value) return;
  const defaultSource = props.sources[0];
  if (!defaultSource) return;
  const newRule: VisibilityRule = { action: "show", condition: { combinator: "AND", conditions: [] } };
  emit("update:modelValue", { ...config.value, rules: [...config.value.rules, newRule] });
}

function removeRule(index: number) {
  if (!config.value) return;
  const rules = config.value.rules.filter((_, i) => i !== index);
  emit("update:modelValue", { ...config.value, rules });
}
</script>

<style scoped lang="scss">
.visibility-rule-row {
  padding: 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}
</style>
