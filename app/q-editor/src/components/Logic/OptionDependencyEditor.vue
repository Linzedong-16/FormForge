<template>
  <div class="option-dependency-editor">
    <!-- 是否为当前题目启用选项联动；关闭时 modelValue 整体为 null，与"未配置"语义对齐 -->
    <div class="flex align-items-center mb-10">
      <span class="mr-10">{{ t("logic.optionDependencySection") }}</span>
      <el-switch :model-value="isEnabled" :disabled="sources.length === 0" @update:model-value="onToggleEnabled" />
    </div>

    <el-text v-if="sources.length === 0" type="warning" size="small" class="mb-10 block-text">
      {{ t("logic.noAvailableOptionDependencySource") }}
    </el-text>

    <template v-if="config">
      <div class="flex align-items-center mb-10">
        <span class="mr-10">{{ t("logic.dependsOnQuestion") }}</span>
        <el-select
          :model-value="config.dependsOnKey"
          :placeholder="t('logic.selectSourceQuestion')"
          class="mr-10 depends-on-select"
          @update:model-value="onDependsOnChange"
        >
          <el-option
            v-for="source in sources"
            :key="source.clientKey"
            :label="source.label"
            :value="source.clientKey"
          />
        </el-select>
      </div>

      <div class="flex align-items-center mb-10">
        <span class="mr-10">{{ t("logic.emptyStrategy") }}</span>
        <el-radio-group :model-value="config.emptyStrategy" size="small" @update:model-value="onEmptyStrategyChange">
          <el-radio-button label="empty">{{ t("logic.emptyStrategyEmpty") }}</el-radio-button>
          <el-radio-button label="promptFillDependency">{{ t("logic.emptyStrategyPrompt") }}</el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="answerKeys.length > 0" class="options-by-answer">
        <div class="mb-10">{{ t("logic.optionsByAnswer") }}</div>
        <div v-for="answerKey in answerKeys" :key="answerKey" class="flex align-items-center mb-10">
          <span class="mr-10 answer-key-label">{{ answerKey }}</span>
          <el-select
            :model-value="config.optionsByAnswer[answerKey] ?? []"
            multiple
            collapse-tags
            :placeholder="t('logic.selectPoolOptions')"
            class="pool-options-select"
            @update:model-value="(val: string[]) => onPoolOptionsChange(answerKey, val)"
          >
            <el-option v-for="option in targetOptions" :key="option" :label="option" :value="option" />
          </el-select>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ClientKey, OptionDependencyMapping } from "monorepo-survey-engine";
import type { OptionDependencySourceOption } from "./logicSources";

const { t } = useI18n();

const props = defineProps<{
  modelValue: OptionDependencyMapping | null | undefined;
  sources: OptionDependencySourceOption[];
  targetOptions: string[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: OptionDependencyMapping | null): void;
}>();

const isEnabled = computed(() => !!props.modelValue);
// 未启用时 config 为 null，模板据此隐藏依赖题目/候选项映射表区域
const config = computed(() => props.modelValue ?? null);

/**
 * 映射表各行的"依赖题目答案值"维度：取依赖题目当前配置的选项 ∪ 已保存 optionsByAnswer 的历史键。
 * 取并集而非仅取当前选项，是为了避免依赖题目选项被临时删除/重命名后，
 * 历史已保存的映射配置在编辑器上"静默消失"（数据仍在 logic 中，只是designer 看不到）。
 */
const answerKeys = computed(() => {
  if (!config.value) return [];
  const currentSource = props.sources.find(source => source.clientKey === config.value?.dependsOnKey);
  const keySet = new Set<string>(currentSource?.options ?? []);
  Object.keys(config.value.optionsByAnswer).forEach(key => keySet.add(key));
  return Array.from(keySet);
});

function onToggleEnabled(enabled: boolean) {
  if (enabled) {
    const defaultSource = props.sources[0];
    if (!defaultSource) return;
    emit("update:modelValue", { dependsOnKey: defaultSource.clientKey, optionsByAnswer: {}, emptyStrategy: "empty" });
  } else {
    emit("update:modelValue", null);
  }
}

// 切换依赖题目后，旧的 optionsByAnswer 键（对应旧依赖题的选项值）不再具备语义，整体清空重新配置
function onDependsOnChange(dependsOnKey: ClientKey) {
  if (!config.value) return;
  emit("update:modelValue", { ...config.value, dependsOnKey, optionsByAnswer: {} });
}

function onEmptyStrategyChange(emptyStrategy: OptionDependencyMapping["emptyStrategy"]) {
  if (!config.value) return;
  emit("update:modelValue", { ...config.value, emptyStrategy });
}

function onPoolOptionsChange(answerKey: string, options: string[]) {
  if (!config.value) return;
  emit("update:modelValue", {
    ...config.value,
    optionsByAnswer: { ...config.value.optionsByAnswer, [answerKey]: options }
  });
}
</script>

<style scoped lang="scss">
.depends-on-select {
  width: 200px;
}
.pool-options-select {
  width: 260px;
}
.answer-key-label {
  min-width: 80px;
}
.block-text {
  display: block;
}
</style>
