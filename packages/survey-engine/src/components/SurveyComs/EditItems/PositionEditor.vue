<template>
  <ButtonGroup :title="t('components.positionEditor.alignment')" :status="status[currentStatus]">
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
import { useI18n } from "vue-i18n";
import type { VueComType } from "../../../types";
import ButtonGroup from "./ButtonGroup.vue";

const { t } = useI18n();

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
