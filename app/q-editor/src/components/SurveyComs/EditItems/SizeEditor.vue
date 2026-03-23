<template>
  <ButtonGroup :title="`${configKey === 'titleSize' ? '标题' : '描述'}尺寸`" :status="`${status[currentStatus]}px`">
    <el-button-group>
      <el-button
        :class="{
          select: currentStatus === 0
        }"
        @click="changeSize(0)"
      >
        <font-awesome-icon icon="font" size="lg" />
      </el-button>
      <el-button
        :class="{
          select: currentStatus === 1
        }"
        @click="changeSize(1)"
      >
        <font-awesome-icon icon="font" size="sm" />
      </el-button>
      <el-button
        :class="{
          select: currentStatus === 2
        }"
        @click="changeSize(2)"
      >
        <font-awesome-icon icon="font" size="xs" />
      </el-button>
    </el-button-group>
  </ButtonGroup>
</template>

<script setup lang="ts">
import { inject } from "vue";
import type { VueComType } from "@/types";
import ButtonGroup from "./ButtonGroup.vue";
const props = defineProps<{
  currentStatus: number;
  status: string[];
  isShow: boolean;
  configKey: string;
  editCom: VueComType;
}>();
const updateStatus = inject("updateStatus") as (configKey: string, payload?: number) => void;
const changeSize = (size: number) => {
  updateStatus(props.configKey, size);
};
</script>

<style scoped></style>
