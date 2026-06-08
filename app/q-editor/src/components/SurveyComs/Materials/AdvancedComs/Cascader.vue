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
    <el-cascader
      v-model="cascaderValue"
      :options="cascaderOptions"
      :props="cascaderProps"
      :placeholder="t('components.cascader.placeholder')"
      clearable
      @click.stop
      @change="emitAnswer"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getTextStatus, getStringStatusByCurrentStatus, getCurrentStatus } from "@/utils";
import MaterialsHeader from "@/components/SurveyComs/Common/MaterialsHeader.vue";
import { regionData } from "@/configs/regionData";
// 类型：多级联动题含通用样式 + cascaderOptions（模式开关 + 自定义级联树）
import type { CascaderStatus, CascaderStatusArr } from "@/types";

const { t } = useI18n();

const props = defineProps<{
  status: CascaderStatus;
  serialNum: number;
}>();
const emits = defineEmits(["updateAnswer"]);

// ElCascader 字段映射（地址数据与自定义级联树统一使用 value/label/children）
const cascaderProps = {
  value: "value",
  label: "label",
  children: "children"
};

// 数据源：自定义模式（isUse）用 status 中的级联树，否则用内置省/市/区地址数据
const cascaderOptions = computed(() =>
  props.status.cascaderOptions.isUse ? (props.status.cascaderOptions.status as CascaderStatusArr) : regionData
);

// 选中的级联路径（叶子节点的完整路径数组）
const cascaderValue = ref<string[]>([]);

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
  descColor: getTextStatus(props.status.descColor)
}));

// 选择变化时向上抛出答案（选中的省/市/区路径数组）
const emitAnswer = () => {
  emits("updateAnswer", cascaderValue.value);
};
</script>

<style scoped lang="scss"></style>
