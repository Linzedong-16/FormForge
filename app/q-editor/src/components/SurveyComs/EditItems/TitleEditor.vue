<template>
  <div key="id">
    <div class="mb-10">标题内容</div>
    <el-input v-model="text" placeholder="请输入题目标题" @update:model-value="inputHandle" />
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from "vue";
import type { VueComType } from "@/types";
const props = defineProps<{
  status: string;
  isShow: boolean;
  configKey: string;
  editCom: VueComType;
  id: string;
}>();

const text = ref(props.status);
const updateStatus = inject("updateStatus") as (
  configKey: string,
  payload?: number | string | boolean | object
) => void;

function inputHandle(newVal: string) {
  updateStatus(props.configKey, newVal);
}
</script>
