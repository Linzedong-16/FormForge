<template>
  <div class="computed-field-editor">
    <div class="flex align-items-center mb-10">
      <span class="mr-10">{{ t("logic.computedFieldSection") }}</span>
    </div>

    <el-alert
      v-if="sources.length === 0"
      :title="t('logic.noAvailableComputedFieldSource')"
      type="warning"
      :closable="false"
      show-icon
      class="mb-10"
    />

    <div class="flex align-items-center mb-10">
      <span class="mr-10">{{ t("logic.computedFieldFormulaKind") }}</span>
      <el-radio-group :model-value="config.formula.kind" size="small" @update:model-value="onFormulaKindChange">
        <el-radio-button label="sum">{{ t("logic.computedFieldFormulaSum") }}</el-radio-button>
        <el-radio-button label="weightedSum">{{ t("logic.computedFieldFormulaWeightedSum") }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="mb-10">
      <div class="mb-10">{{ t("logic.computedFieldSelectSources") }}</div>
      <el-select
        :model-value="selectedSourceKeys"
        multiple
        :disabled="sources.length === 0"
        style="width: 100%"
        :class="{ 'mb-10': config.formula.kind === 'weightedSum' }"
        @update:model-value="
          config.formula.kind === 'sum' ? onSumSourceKeysChange($event) : onWeightedSourceKeysChange($event)
        "
      >
        <el-option v-for="source in sources" :key="source.clientKey" :label="source.label" :value="source.clientKey" />
      </el-select>

      <!-- weightedSum 模式下需为每个已选参与题目单独配置权重 -->
      <div v-if="config.formula.kind === 'weightedSum'">
        <div v-for="key in selectedSourceKeys" :key="key" class="flex align-items-center mb-10 weighted-source-row">
          <span class="mr-10">{{ getSourceLabel(key) }}</span>
          <el-input-number
            :model-value="getWeight(key)"
            :step="0.1"
            size="small"
            @update:model-value="(weight: number | undefined) => onWeightChange(key, weight ?? 0)"
          />
        </div>
      </div>
    </div>

    <div class="flex align-items-center mb-10">
      <span class="mr-10">{{ t("logic.computedFieldIncompleteStrategy") }}</span>
      <el-radio-group
        :model-value="config.incompleteStrategy"
        size="small"
        @update:model-value="onIncompleteStrategyChange"
      >
        <el-radio-button label="treatAsZero">{{ t("logic.computedFieldIncompleteTreatAsZero") }}</el-radio-button>
        <el-radio-button label="skipCalculation">{{
          t("logic.computedFieldIncompleteSkipCalculation")
        }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="flex align-items-center">
      <span class="mr-10">{{ t("logic.computedFieldVisibleToFiller") }}</span>
      <el-switch :model-value="config.visibleToFiller" @update:model-value="onVisibleToFillerChange" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ClientKey, ComputedFieldConfig, ComputedFieldFormula } from "monorepo-survey-engine";
import type { ComputedFieldSourceOption } from "./logicSources";

const { t } = useI18n();

const props = defineProps<{
  modelValue: ComputedFieldConfig | null | undefined;
  sources: ComputedFieldSourceOption[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: ComputedFieldConfig): void;
}>();

// "计算字段"是题目本身的核心配置而非可叠加的可选规则，未配置时展示一份合理的默认公式供设计者继续调整
const DEFAULT_CONFIG: ComputedFieldConfig = {
  formula: { kind: "sum", sourceKeys: [] },
  incompleteStrategy: "treatAsZero",
  visibleToFiller: true
};

const config = computed<ComputedFieldConfig>(() => props.modelValue ?? DEFAULT_CONFIG);

// 无论当前公式类型，统一读取已参与计算的题目 client_key 列表，供两种公式模式复用同一个题目选择器
const selectedSourceKeys = computed<ClientKey[]>(() => {
  const formula = config.value.formula;
  return formula.kind === "sum" ? formula.sourceKeys : formula.sources.map(source => source.key);
});

function getSourceLabel(key: ClientKey): string {
  return props.sources.find(source => source.clientKey === key)?.label ?? key;
}

function getWeight(key: ClientKey): number {
  const formula = config.value.formula;
  if (formula.kind !== "weightedSum") return 1;
  return formula.sources.find(source => source.key === key)?.weight ?? 1;
}

function onFormulaKindChange(kind: ComputedFieldFormula["kind"]) {
  if (kind === config.value.formula.kind) return;
  const formula: ComputedFieldFormula =
    kind === "sum"
      ? { kind: "sum", sourceKeys: selectedSourceKeys.value }
      : { kind: "weightedSum", sources: selectedSourceKeys.value.map(key => ({ key, weight: 1 })) };
  emit("update:modelValue", { ...config.value, formula });
}

function onSumSourceKeysChange(keys: ClientKey[]) {
  emit("update:modelValue", { ...config.value, formula: { kind: "sum", sourceKeys: keys } });
}

function onWeightedSourceKeysChange(keys: ClientKey[]) {
  const formula = config.value.formula;
  const existingSources = formula.kind === "weightedSum" ? formula.sources : [];
  // 保留已选题目原有权重，新增题目默认权重为 1
  const sources = keys.map(key => ({ key, weight: existingSources.find(source => source.key === key)?.weight ?? 1 }));
  emit("update:modelValue", { ...config.value, formula: { kind: "weightedSum", sources } });
}

function onWeightChange(key: ClientKey, weight: number) {
  const formula = config.value.formula;
  if (formula.kind !== "weightedSum") return;
  const sources = formula.sources.map(source => (source.key === key ? { ...source, weight } : source));
  emit("update:modelValue", { ...config.value, formula: { kind: "weightedSum", sources } });
}

function onIncompleteStrategyChange(incompleteStrategy: ComputedFieldConfig["incompleteStrategy"]) {
  emit("update:modelValue", { ...config.value, incompleteStrategy });
}

function onVisibleToFillerChange(visibleToFiller: boolean) {
  emit("update:modelValue", { ...config.value, visibleToFiller });
}
</script>

<style scoped lang="scss">
.weighted-source-row {
  padding-left: 10px;
}
</style>
