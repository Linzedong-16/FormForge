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
    <el-date-picker
      v-model="datetimeValue"
      :type="computedState.type?.value"
      :placeholder="t('components.dateTime.placeholder')"
      @click.stop
      @change="emitAnswer"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  getTextStatus,
  getStringStatusByCurrentStatus,
  getCurrentStatus,
  getValueStatusByCurrentStatus
} from "../../../../utils";
import MaterialsHeader from "../../../../components/SurveyComs/Common/MaterialsHeader.vue";
// 类型
import type { TypeStatus } from "../../../../types";

const { t } = useI18n();

const props = defineProps<{
  status: TypeStatus;
  serialNum: number;
}>();
const emits = defineEmits(["updateAnswer"]);
const datetimeValue = ref<Date>(new Date());
const computedState = computed(() => ({
  title: getTextStatus(props.status.title),
  desc: getTextStatus(props.status.desc),
  position: getCurrentStatus(props.status.position),
  type: getValueStatusByCurrentStatus(props.status.type),
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
  emits("updateAnswer", datetimeValue.value);
};
</script>

<style scoped lang="scss"></style>
