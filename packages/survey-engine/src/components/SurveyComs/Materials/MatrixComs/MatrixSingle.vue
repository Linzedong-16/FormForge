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
    <!-- 矩阵单选：每行（评价维度）在各列（评价等级）中单选一个 -->
    <el-table :data="tableData" border size="small" class="matrix-table" @click.stop>
      <el-table-column prop="rowLabel" label="" min-width="110" />
      <el-table-column v-for="(col, ci) in computedState.columns" :key="ci" :label="col" align="center">
        <template #default="{ $index }">
          <el-radio v-model="answers[$index]" :value="ci" @change="emitAnswer">
            <span></span>
          </el-radio>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import { getTextStatus, getStringStatus, getStringStatusByCurrentStatus, getCurrentStatus } from "../../../../utils";
import MaterialsHeader from "../../../../components/SurveyComs/Common/MaterialsHeader.vue";
import type { MatrixStatus, StringStatusArr } from "../../../../types";

const props = defineProps<{
  status: MatrixStatus;
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
  // 行（评价维度）与列（评价等级）
  rows: getStringStatus(props.status.matrixRows) as StringStatusArr,
  columns: getStringStatus(props.status.matrixColumns) as StringStatusArr
}));

// el-table 数据：每行一条记录
const tableData = computed(() => computedState.value.rows.map((label, idx) => ({ rowLabel: label, idx })));

// 每行选中的列索引（key 为行索引，value 为列索引）
const answers = reactive<Record<number, number>>({});

// 选择变化时向上抛出答案（行索引 → 列索引）
const emitAnswer = () => {
  emits("updateAnswer", { ...answers });
};
</script>

<style scoped lang="scss">
.matrix-table {
  width: 100%;
}
</style>
