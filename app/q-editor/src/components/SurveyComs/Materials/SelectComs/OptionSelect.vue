<template>
  <div
    :class="{
      'text-center': computedState.position
    }"
  >
    <MaterialsHeader
      :serial-num="serialNum"
      :title="computedState.title"
      :title-size="computedState.titleSize"
      :title-weight="computedState.titleWeight"
      :title-italic="computedState.titleItalic"
      :title-color="computedState.titleColor"
      :desc="computedState.desc"
      :desc-size="computedState.descSize"
      :desc-weight="computedState.descWeight"
      :desc-italic="computedState.descItalic"
      :desc-color="computedState.descColor"
    />
    <!-- 选项联动处于"需先完成依赖题"提示态时，不展示下拉框，转而展示引导文案（T036） -->
    <el-text v-if="isPoolPrompting" type="info" size="small">{{ t("survey.optionDependencyPrompt") }}</el-text>
    <el-select
      v-else
      v-model="optionValue"
      :placeholder="t('components.optionSelect.placeholder')"
      size="large"
      style="width: 240px"
      @click.stop
      @change="emitAnswer"
    >
      <!-- 答案以选项文本本身存储，候选池收窄可直接过滤展示数组，无需保留原始下标（与 SingleSelect 的索引存储语义不同） -->
      <el-option v-for="(item, index) in displayOptions" :key="index" :label="item" :value="item" />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getTextStatus, getStringStatus, getStringStatusByCurrentStatus, getCurrentStatus } from "@/utils";
import MaterialsHeader from "@/components/SurveyComs/Common/MaterialsHeader.vue";
// 类型
import type { OptionsStatus } from "@/types";
import { isStringArray } from "@/types";

const { t } = useI18n();

const props = defineProps<{
  status: OptionsStatus;
  serialNum: number;
  /** 选项联动候选池（T036）：数组表示限定可选文本集合，{ prompt: true } 表示需先完成依赖题，undefined 表示未启用选项联动 */
  optionPool?: string[] | { prompt: true };
}>();
const emits = defineEmits(["updateAnswer"]);
const optionValue = ref<string>("");
const computedState = computed(() => ({
  title: getTextStatus(props.status.title),
  desc: getTextStatus(props.status.desc),
  options: getStringStatus(props.status.options),
  position: getCurrentStatus(props.status.position),
  titleSize: getStringStatusByCurrentStatus(props.status.titleSize) as string,
  descSize: getStringStatusByCurrentStatus(props.status.descSize) as string,
  titleWeight: getCurrentStatus(props.status.titleWeight),
  descWeight: getCurrentStatus(props.status.descWeight),
  titleItalic: getCurrentStatus(props.status.titleItalic),
  descItalic: getCurrentStatus(props.status.descItalic),
  titleColor: getTextStatus(props.status.titleColor),
  descColor: getTextStatus(props.status.descColor)
}));

/** 是否处于"需先完成依赖题"提示态（emptyStrategy: promptFillDependency 且依赖题未作答） */
const isPoolPrompting = computed(() => !!props.optionPool && !Array.isArray(props.optionPool));

/**
 * 收窄为纯字符串选项列表：option-select 等题型的 options.status 始终为 StringStatusArr，
 * 但 getStringStatus() 的返回类型是跨全部选择类题型的联合类型 OptionsStatusArr，
 * 此处显式收窄以安全支持后续的选项联动过滤（T036），非字符串数组时兜底为空数组
 */
const optionTexts = computed<string[]>(() => {
  const options = computedState.value.options;
  return isStringArray(options) ? options : [];
});

/** 实际渲染的下拉选项：未启用选项联动（optionPool 为 undefined）时展示全部选项，否则收窄为候选池内的选项 */
const displayOptions = computed(() =>
  props.optionPool && Array.isArray(props.optionPool)
    ? optionTexts.value.filter(item => (props.optionPool as string[]).includes(item))
    : optionTexts.value
);

const emitAnswer = () => {
  emits("updateAnswer", optionValue.value);
};
</script>

<style scoped></style>
