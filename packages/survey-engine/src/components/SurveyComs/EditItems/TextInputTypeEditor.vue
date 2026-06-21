<template>
  <ButtonGroup :title="t('components.textInputTypeEditor.textType')" :status="status[currentStatus]">
    <el-button-group>
      <el-button
        :class="{
          select: currentStatus === 0
        }"
        :icon="DocumentRemove"
        @click="changeType(0)"
      >
      </el-button>
      <el-button
        :class="{
          select: currentStatus === 1
        }"
        :icon="Document"
        @click="changeType(1)"
      >
      </el-button>
    </el-button-group>
  </ButtonGroup>
</template>

<script setup lang="ts">
import { Document, DocumentRemove } from "@element-plus/icons-vue";
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
    // 第三个参数为true，表示不改变当前组件的状态
    updateStatus(props.configKey, pos, true);
  } else {
    console.warn("updateStatus is not provided");
  }
}
</script>

<style scoped></style>
