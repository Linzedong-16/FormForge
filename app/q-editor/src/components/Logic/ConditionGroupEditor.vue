<template>
  <div class="condition-group-editor">
    <el-text v-if="sources.length === 0" type="info" size="small">{{ t("logic.noAvailableSource") }}</el-text>

    <template v-else>
      <div class="flex align-items-center mb-10">
        <span class="mr-10">{{ t("logic.combinator") }}</span>
        <el-radio-group :model-value="modelValue.combinator" size="small" @update:model-value="onCombinatorChange">
          <el-radio-button label="AND">{{ t("logic.and") }}</el-radio-button>
          <el-radio-button label="OR">{{ t("logic.or") }}</el-radio-button>
        </el-radio-group>
      </div>

      <div
        v-for="(condition, index) in modelValue.conditions"
        :key="index"
        class="condition-row flex align-items-center mb-10"
      >
        <el-select
          :model-value="condition.sourceKey"
          :placeholder="t('logic.selectSourceQuestion')"
          class="mr-10 condition-select"
          @update:model-value="(val: string) => onSourceChange(index, val)"
        >
          <el-option
            v-for="source in sources"
            :key="source.clientKey"
            :label="source.label"
            :value="source.clientKey"
          />
        </el-select>

        <el-select
          :model-value="condition.operator"
          :placeholder="t('logic.selectOperator')"
          class="mr-10 condition-select-narrow"
          @update:model-value="(val: ComparisonOperator) => onOperatorChange(index, val)"
        >
          <el-option
            v-for="op in operatorOptions(condition.sourceKey)"
            :key="op"
            :label="t(`logic.operators.${op}`)"
            :value="op"
          />
        </el-select>

        <!-- 值输入控件类型必须与来源题目的 NormalizedValue.kind 严格对齐，否则 number kind 会拿到字符串值，
             导致 evaluator.ts 的 typeof 检查失败、规则表面配置成功却永不命中 -->
        <el-input-number
          v-if="needsValue(condition.operator) && valueKindOf(condition.sourceKey) === 'number'"
          :model-value="typeof condition.value === 'number' ? condition.value : undefined"
          class="mr-10"
          @update:model-value="(val: number | undefined) => updateCondition(index, { value: val ?? undefined })"
        />
        <el-input
          v-else-if="needsValue(condition.operator)"
          :model-value="typeof condition.value === 'string' ? condition.value : ''"
          :placeholder="t('logic.conditionValuePlaceholder')"
          class="mr-10"
          @update:model-value="(val: string) => updateCondition(index, { value: val })"
        />

        <el-button type="danger" size="small" circle :icon="Minus" @click="removeCondition(index)" />
      </div>

      <el-button size="small" :icon="Plus" @click="addCondition">{{ t("logic.addCondition") }}</el-button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Plus, Minus } from "@element-plus/icons-vue";
import type { ClientKey, Condition, ConditionGroup, ComparisonOperator, LogicCombinator } from "monorepo-survey-engine";
import type { ConditionSourceOption, ConditionValueKind } from "./logicSources";

const { t } = useI18n();

const props = defineProps<{
  modelValue: ConditionGroup;
  sources: ConditionSourceOption[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: ConditionGroup): void;
}>();

// 各 NormalizedValue.kind 下真正被 packages/survey-engine/src/logic/evaluator.ts 支持的运算符集合，
// 与引擎实现严格对齐，避免 UI 允许配置引擎运行时永远不命中的组合
const OPERATORS_BY_KIND: Record<ConditionValueKind, ComparisonOperator[]> = {
  text: ["eq", "neq", "contains", "notContains", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  "text-list": ["contains", "notContains", "isEmpty", "isNotEmpty"],
  matrix: ["isEmpty", "isNotEmpty"]
};

function valueKindOf(sourceKey: ClientKey): ConditionValueKind | undefined {
  return props.sources.find(source => source.clientKey === sourceKey)?.valueKind;
}

function operatorOptions(sourceKey: ClientKey): ComparisonOperator[] {
  const kind = valueKindOf(sourceKey);
  return kind ? OPERATORS_BY_KIND[kind] : OPERATORS_BY_KIND.text;
}

function needsValue(operator: ComparisonOperator): boolean {
  return operator !== "isEmpty" && operator !== "isNotEmpty";
}

function updateCondition(index: number, patch: Partial<Condition>) {
  const conditions = props.modelValue.conditions.map((condition, i) =>
    i === index ? { ...condition, ...patch } : condition
  );
  emit("update:modelValue", { ...props.modelValue, conditions });
}

// 切换来源题目后，若原运算符不再适用于新题目的取值类型则重置为该类型的首个合法运算符，并清空比较值，
// 避免残留一个类型不匹配、规则静默失效的隐蔽配置
function onSourceChange(index: number, sourceKey: ClientKey) {
  const current = props.modelValue.conditions[index];
  if (!current) return;
  const validOperators = operatorOptions(sourceKey);
  const operator = validOperators.includes(current.operator) ? current.operator : (validOperators[0] ?? "isEmpty");
  updateCondition(index, { sourceKey, operator, value: undefined });
}

function onOperatorChange(index: number, operator: ComparisonOperator) {
  const current = props.modelValue.conditions[index];
  if (!current) return;
  updateCondition(index, { operator, value: needsValue(operator) ? current.value : undefined });
}

function onCombinatorChange(combinator: LogicCombinator) {
  emit("update:modelValue", { ...props.modelValue, combinator });
}

function addCondition() {
  const defaultSource = props.sources[0];
  if (!defaultSource) return;
  const defaultOperator = operatorOptions(defaultSource.clientKey)[0] ?? "isEmpty";
  const conditions: Condition[] = [
    ...props.modelValue.conditions,
    { sourceKey: defaultSource.clientKey, operator: defaultOperator, value: undefined }
  ];
  emit("update:modelValue", { ...props.modelValue, conditions });
}

function removeCondition(index: number) {
  const conditions = props.modelValue.conditions.filter((_, i) => i !== index);
  emit("update:modelValue", { ...props.modelValue, conditions });
}
</script>

<style scoped lang="scss">
.condition-select {
  width: 160px;
}
.condition-select-narrow {
  width: 120px;
}
</style>
