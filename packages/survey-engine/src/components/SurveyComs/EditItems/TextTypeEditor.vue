<template>
  <ButtonGroup :title="t('components.textTypeEditor.descriptionType')" :status="status[currentStatus]">
    <el-button-group>
      <el-button
        :class="{
          select: currentStatus === 0
        }"
        @click="changeType(0)"
      >
        <font-awesome-icon icon="heading" />
      </el-button>
      <el-button
        :class="{
          select: currentStatus === 1
        }"
        @click="changeType(1)"
      >
        <font-awesome-icon icon="paragraph" />
      </el-button>
    </el-button-group>
  </ButtonGroup>
</template>

<script setup lang="ts">
import type { VueComType, UpdateStatus } from "../../../types";
import { inject } from "vue";
import { useI18n } from "vue-i18n";
import ButtonGroup from "./ButtonGroup.vue";

const { t } = useI18n();

const updateStatus = inject<UpdateStatus>("updateStatus");

const props = defineProps<{
  currentStatus: number;
  status: string[];
  isShow: boolean;
  configKey: string;
  editCom: VueComType;
}>();
function changeType(pos: number) {
  if (updateStatus) {
    updateStatus(props.configKey, pos, true);
  } else {
    console.warn("updateStatus is not provided");
  }
}
</script>

<style scoped></style>
