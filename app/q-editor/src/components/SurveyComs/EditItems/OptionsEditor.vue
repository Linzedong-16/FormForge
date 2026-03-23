<template>
  <div key="id">
    <div class="flex align-items-center mb-10">
      <div class="mr-10">选项</div>
      <el-button size="small" circle :icon="Plus" @click="addOptionHandle" />
    </div>
    <div v-for="(item, index) in status" :key="index" class="flex align-items-center">
      <el-input v-model="textArr[index]" placeholder="选项" class="mt-5 mb-5" />
      <el-button type="danger" class="ml-10" size="small" :icon="Minus" circle @click="removeOption(index)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from "vue";
import { Plus, Minus } from "@element-plus/icons-vue";
import type { VueComType } from "@/types";
const props = defineProps<{
  status: string[];
  isShow: boolean;
  configKey: string;
  editCom: VueComType;
  id: string;
}>();

const textArr = ref(props.status);
const updateStatus = inject("updateStatus") as (configKey: string, payload?: number) => void;
const addOptionHandle = () => {
  updateStatus(props.configKey);
};

const removeOption = (index: number) => {
  updateStatus(props.configKey, index);
};
</script>

<style scoped></style>
