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
    <div class="flex wrap">
      <el-radio-group v-model="radioValue" class="flex wrap" @click.stop @change="emitAnswer">
        <el-radio
          v-for="(item, index) in computedState.options"
          :key="index"
          class="picOption flex mb-15"
          :value="item.picTitle"
        >
          <PicItem :key="index" v-bind="{ ...item, index }" />
        </el-radio>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import MaterialsHeader from "../../../../components/SurveyComs/Common/MaterialsHeader.vue";
import PicItem from "../../../../components/SurveyComs/Common/PicItem.vue";
import type { OptionsStatus } from "../../../../types";
import {
  getTextStatus,
  getCurrentStatus,
  getStringStatusByCurrentStatus,
  getPicTitleDescStatusArr
} from "../../../../utils";
const props = defineProps<{
  serialNum: number;
  status: OptionsStatus;
}>();
const emits = defineEmits(["updateAnswer"]);
const radioValue = ref("");
const computedState = computed(() => ({
  title: getTextStatus(props.status.title),
  desc: getTextStatus(props.status.desc),
  position: getCurrentStatus(props.status.position),
  options: getPicTitleDescStatusArr(props.status.options),
  titleSize: getStringStatusByCurrentStatus(props.status.titleSize) as string,
  descSize: getStringStatusByCurrentStatus(props.status.descSize) as string,
  titleWeight: getCurrentStatus(props.status.titleWeight),
  descWeight: getCurrentStatus(props.status.descWeight),
  titleItalic: getCurrentStatus(props.status.titleItalic),
  descItalic: getCurrentStatus(props.status.descItalic),
  titleColor: getTextStatus(props.status.titleColor),
  descColor: getTextStatus(props.status.descColor)
}));
/** 选择变化时向上层 SurveyView 发射答案 */
const emitAnswer = () => {
  emits("updateAnswer", radioValue.value);
};
</script>

<style scoped lang="scss">
.picOption {
  height: auto;
  flex-direction: column-reverse;
}
</style>
