<template>
  <ButtonGroup title="居中设置" :status="status[currentStatus]">
    <el-button-group>
      <el-button
        :class="{
          select: currentStatus === 0
        }"
        @click="changePosition(0)"
      >
        <font-awesome-icon icon="align-left" />
      </el-button>
      <el-button
        :class="{
          select: currentStatus === 1
        }"
        @click="changePosition(1)"
      >
        <font-awesome-icon icon="align-center" />
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
const changePosition = (pos: number) => {
  updateStatus(props.configKey, pos);
};
</script>

<style scoped></style>
