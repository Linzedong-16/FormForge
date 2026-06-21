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
    <!-- 滑块：连续值输入（价格 / 数量等） -->
    <div class="slider-wrap" @click.stop>
      <el-slider
        v-model="sliderValue"
        :min="computedState.min"
        :max="computedState.max"
        :step="computedState.step"
        show-input
        @change="emitAnswer"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { getTextStatus, getStringStatus, getStringStatusByCurrentStatus, getCurrentStatus } from "../../../../utils";
import MaterialsHeader from "../../../../components/SurveyComs/Common/MaterialsHeader.vue";
import type { SliderStatus, StringStatusArr } from "../../../../types";

const props = defineProps<{
  status: SliderStatus;
  serialNum: number;
}>();
const emits = defineEmits(["updateAnswer"]);

const computedState = computed(() => {
  // sliderConfig.status = [最小值, 最大值, 步长]
  const cfg = getStringStatus(props.status.sliderConfig) as StringStatusArr;
  return {
    title: getTextStatus(props.status.title),
    desc: getTextStatus(props.status.desc),
    position: getCurrentStatus(props.status.position),
    titleSize: getStringStatusByCurrentStatus(props.status.titleSize) as string,
    descSize: getStringStatusByCurrentStatus(props.status.descSize) as string,
    titleWeight: getCurrentStatus(props.status.titleWeight),
    descWeight: getCurrentStatus(props.status.descWeight),
    titleItalic: getCurrentStatus(props.status.titleItalic),
    descItalic: getCurrentStatus(props.status.descItalic),
    titleColor: getTextStatus(props.status.titleColor),
    descColor: getTextStatus(props.status.descColor),
    min: Number(cfg[0] ?? 0),
    max: Number(cfg[1] ?? 100),
    step: Number(cfg[2] ?? 1)
  };
});

// 滑块当前值，默认取最小值
const sliderValue = ref(computedState.value.min);

// 拖动/输入变化时向上抛出答案
const emitAnswer = () => {
  emits("updateAnswer", sliderValue.value);
};
</script>

<style scoped lang="scss">
.slider-wrap {
  padding: 0 10px;
}
</style>
