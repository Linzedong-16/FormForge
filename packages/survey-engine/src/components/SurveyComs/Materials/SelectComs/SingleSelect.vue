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
      <el-radio-group v-model="radioValue" @click.stop @change="emitAnswer">
        <el-radio v-for="(item, index) in computedState.options" :key="index" :value="index">
          {{ item }}
        </el-radio>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import MaterialsHeader from "../../../../components/SurveyComs/Common/MaterialsHeader.vue";
import type { OptionsStatus } from "../../../../types";
import { computed, ref } from "vue";
const props = defineProps<{
  serialNum: number;
  status: OptionsStatus;
}>();

import { getTextStatus, getStringStatus, getCurrentStatus, getStringStatusByCurrentStatus } from "../../../../utils";
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

const radioValue = ref<string>("");

const emitAnswer = () => {
  emits("updateAnswer", radioValue.value);
};
</script>
