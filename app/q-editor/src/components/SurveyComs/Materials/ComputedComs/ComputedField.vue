<template>
  <div :class="{ 'text-center': computedStatus.position }">
    <p
      class="pb-5"
      :class="{
        'font-italic': !computedStatus.titleItalic,
        'font-bold': !computedStatus.titleWeight
      }"
      :style="{
        fontSize: computedStatus.titleSize + 'px',
        color: computedStatus.titleColor
      }"
    >
      {{ computedStatus.title }}
    </p>
    <p
      v-if="computedStatus.desc"
      :class="{
        'font-italic': !computedStatus.descItalic,
        'font-bold': !computedStatus.descWeight
      }"
      :style="{
        fontSize: computedStatus.descSize + 'px',
        color: computedStatus.descColor
      }"
    >
      {{ computedStatus.desc }}
    </p>
    <p class="computed-field-value">{{ displayValue }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { getTextStatus, getStringStatusByCurrentStatus, getCurrentStatus } from "@/utils";
import type { BaseStatus } from "@/types";

// computed-field 是只读展示型伪题型：不由填写者直接输入，答案由其他题目实时计算得出，
// 因此不声明 serialNum、不 emit updateAnswer，渲染范式与 text-note 一致（不复用 MaterialsHeader）
const props = defineProps<{
  status: BaseStatus;
  // 由填写页 computeDerivedField() 计算得出的实时结果；编辑器画布预览态未接入真实答案时为 undefined
  computedValue?: number | null;
}>();

const computedStatus = computed(() => ({
  title: getTextStatus(props.status.title),
  desc: getTextStatus(props.status.desc),
  position: getCurrentStatus(props.status.position),
  titleSize: getStringStatusByCurrentStatus(props.status.titleSize),
  descSize: getStringStatusByCurrentStatus(props.status.descSize),
  titleWeight: getCurrentStatus(props.status.titleWeight),
  descWeight: getCurrentStatus(props.status.descWeight),
  titleItalic: getCurrentStatus(props.status.titleItalic),
  descItalic: getCurrentStatus(props.status.descItalic),
  titleColor: getTextStatus(props.status.titleColor),
  descColor: getTextStatus(props.status.descColor)
}));

// 计算结果为空（未产出/降级为 null）时显示占位符，避免误展示为 0
const displayValue = computed(() =>
  props.computedValue === undefined || props.computedValue === null ? "--" : props.computedValue
);
</script>

<style scoped>
.computed-field-value {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}
</style>
