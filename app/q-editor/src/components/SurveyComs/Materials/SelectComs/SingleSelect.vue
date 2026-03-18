<template>
  <div>
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
      <el-radio-group>
        <el-radio :value="1">选项1</el-radio>
        <el-radio :value="2">选项2</el-radio>
        <el-radio :value="3">选项3</el-radio>
        <el-radio :value="4">选项4</el-radio>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import MaterialsHeader from "@/components/SurveyComs/Common/MaterialsHeader.vue";
import type { OptionsStatus } from "@/types";
import { computed } from "vue";
const props = defineProps<{
  serialNum: number;
  status: OptionsStatus;
}>();

import { getTextStatus, getStringStatus, getCurrentStatus, getStringStatusByCurrentStatus } from "@/utils";

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
</script>

<style scoped></style>
