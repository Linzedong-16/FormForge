<template>
  <div
    :class="{
      'text-center': computedState.position
    }"
  >
    <MaterialsHeader
      :serial-num="serialNum"
      :title="computedState.title"
      :desc="computedState.desc"
      :title-size="computedState.titleSize"
      :desc-size="computedState.descSize"
      :title-weight="computedState.titleWeight"
      :desc-weight="computedState.descWeight"
      :title-italic="computedState.titleItalic"
      :desc-italic="computedState.descItalic"
      :title-color="computedState.titleColor"
      :desc-color="computedState.descColor"
    />
    <div class="radio-group">
      <!-- 选项联动处于"需先完成依赖题"提示态时，不展示任何选项，转而展示引导文案（T036） -->
      <el-text v-if="isPoolPrompting" type="info" size="small">{{ t("survey.optionDependencyPrompt") }}</el-text>
      <el-radio-group v-else v-model="radioValue" @click.stop @change="emitAnswer">
        <!--
          注意：radio 的 :value 始终取自完整选项数组 computedState.options 的原始下标 index，
          因为底层答案以该下标存储（normalizeAnswerValue 按 single-select 分支转换为选项文本）；
          候选池收窄只能通过 v-show 隐藏元素，不能过滤数组本身，否则会导致下标错位、答案与展示文本不一致
        -->
        <el-radio v-for="(item, index) in optionTexts" v-show="isOptionAvailable(item)" :key="index" :value="index">
          {{ item }}
        </el-radio>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import MaterialsHeader from "@/components/SurveyComs/Common/MaterialsHeader.vue";
import type { OptionsStatus } from "@/types";
import { isStringArray } from "@/types";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
const { t } = useI18n();
const props = defineProps<{
  serialNum: number;
  status: OptionsStatus;
  /** 选项联动候选池（T036）：数组表示限定可选文本集合，{ prompt: true } 表示需先完成依赖题，undefined 表示未启用选项联动 */
  optionPool?: string[] | { prompt: true };
}>();

import { getTextStatus, getStringStatus, getCurrentStatus, getStringStatusByCurrentStatus } from "@/utils";
const emits = defineEmits(["updateAnswer"]);
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
 * 收窄为纯字符串选项列表：single-select 等题型的 options.status 始终为 StringStatusArr，
 * 但 getStringStatus() 的返回类型是跨全部选择类题型的联合类型 OptionsStatusArr，
 * 此处显式收窄以安全支持后续的选项联动过滤（T036），非字符串数组时兜底为空数组
 */
const optionTexts = computed<string[]>(() => {
  const options = computedState.value.options;
  return isStringArray(options) ? options : [];
});

/** 某选项文本当前是否在候选池内：未启用选项联动（optionPool 为 undefined）时不做任何限制 */
const isOptionAvailable = (item: string) =>
  !props.optionPool || !Array.isArray(props.optionPool) || props.optionPool.includes(item);

const radioValue = ref<string>("");

const emitAnswer = () => {
  emits("updateAnswer", radioValue.value);
};
</script>
