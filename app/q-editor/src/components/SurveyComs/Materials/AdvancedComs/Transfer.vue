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
    <!-- 排序题：将左侧选项按优先级移入右侧，右侧顺序即排序结果 -->
    <div class="transfer-wrap" @click.stop>
      <el-transfer
        v-model="selected"
        :data="transferData"
        :titles="['待排序', '已排序']"
        target-order="push"
        @change="emitAnswer"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { getTextStatus, getStringStatus, getStringStatusByCurrentStatus, getCurrentStatus } from "@/utils";
import MaterialsHeader from "@/components/SurveyComs/Common/MaterialsHeader.vue";
import type { TransferStatus, StringStatusArr } from "@/types";

const props = defineProps<{
  status: TransferStatus;
  serialNum: number;
}>();
const emits = defineEmits(["updateAnswer"]);

const computedState = computed(() => ({
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
  // 待排序选项标签
  items: getStringStatus(props.status.transferItems) as StringStatusArr
}));

// el-transfer 数据：key 为选项索引，label 为选项文本
const transferData = computed(() => computedState.value.items.map((label, idx) => ({ key: idx, label })));

// 右侧已排序的选项 key 顺序（target-order=push 使顺序为移入先后）
const selected = ref<number[]>([]);

// 排序变化时向上抛出答案（已排序的选项索引顺序）
const emitAnswer = () => {
  emits("updateAnswer", [...selected.value]);
};
</script>

<style scoped lang="scss">
.transfer-wrap {
  display: flex;
  justify-content: center;
}
</style>
