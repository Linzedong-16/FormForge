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
    <el-select
      v-model="optionValue"
      :placeholder="t('components.optionSelect.placeholder')"
      size="large"
      style="width: 240px"
      @click.stop
      @change="emitAnswer"
    >
      <el-option v-for="(item, index) in computedState.options" :key="index" :label="item" :value="item" />
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

const { t } = useI18n();

const props = defineProps<{
  status: OptionsStatus;
  serialNum: number;
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
const emitAnswer = () => {
  emits("updateAnswer", optionValue.value);
};
</script>

<style scoped></style>
