<template>
  <div key="id">
    <div class="flex align-items-center mb-10">
      <!-- 根据 configKey 区分「行（评价维度）」与「列（评价等级）」 -->
      <div class="mr-10">
        {{ isRow ? t("components.matrixOptionsEditor.row") : t("components.matrixOptionsEditor.column") }}
      </div>
      <el-button size="small" circle :icon="Plus" @click="addHandle" />
    </div>
    <div v-for="(item, index) in textArr" :key="index" class="flex align-items-center">
      <el-input
        v-model="textArr[index]"
        size="small"
        :placeholder="
          isRow
            ? t('components.matrixOptionsEditor.rowPlaceholder')
            : t('components.matrixOptionsEditor.columnPlaceholder')
        "
        class="mt-5 mb-5"
      />
      <el-button type="danger" class="ml-10" size="small" :icon="Minus" circle @click="removeHandle(index)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, Minus } from "@element-plus/icons-vue";
import type { VueComType, UpdateStatus } from "../../../types";

const { t } = useI18n();

const props = defineProps<{
  status: string[];
  isShow: boolean;
  currentStatus: number;
  configKey: string;
  editCom: VueComType;
  id: string;
  name: string;
}>();

// 行编辑器对应 matrixRows，列编辑器对应 matrixColumns
const isRow = computed(() => props.configKey === "matrixRows");

// 直接引用 store 中的数组，文本修改即时同步到 pinia
const textArr = ref(props.status);

const updateStatus = inject<UpdateStatus>("updateStatus");

// 新增一项（无 payload）；删除传索引——均复用现有 addOption/removeOption
const addHandle = () => {
  updateStatus?.(props.configKey);
};
const removeHandle = (index: number) => {
  updateStatus?.(props.configKey, index);
};
</script>

<style scoped></style>
