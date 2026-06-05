<template>
  <div key="id">
    <div class="mb-10">滑块配置</div>
    <!-- 最小值 / 最大值 / 步长，直接修改 store 中的引用，实时同步到 pinia -->
    <div class="flex align-items-center space-between mb-5">
      <span class="label">最小值</span>
      <el-input-number
        :model-value="num(0)"
        size="small"
        controls-position="right"
        @change="(v?: number) => set(0, v)"
      />
    </div>
    <div class="flex align-items-center space-between mb-5">
      <span class="label">最大值</span>
      <el-input-number
        :model-value="num(1)"
        size="small"
        controls-position="right"
        @change="(v?: number) => set(1, v)"
      />
    </div>
    <div class="flex align-items-center space-between mb-5">
      <span class="label">步长</span>
      <el-input-number
        :model-value="num(2)"
        :min="1"
        size="small"
        controls-position="right"
        @change="(v?: number) => set(2, v)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { VueComType } from "@/types";

const props = defineProps<{
  status: string[];
  isShow: boolean;
  currentStatus: number;
  configKey: string;
  editCom: VueComType;
  id: string;
  name: string;
}>();

// 直接引用 store 中的数组（[min, max, step]），修改即同步到 pinia
const arr = ref(props.status);

const num = (i: number) => Number(arr.value[i]);
const set = (i: number, v: number | undefined) => {
  arr.value[i] = String(v ?? 0);
};
</script>

<style scoped lang="scss">
.label {
  color: var(--font-color-light);
  font-size: var(--font-size-base);
}
</style>
