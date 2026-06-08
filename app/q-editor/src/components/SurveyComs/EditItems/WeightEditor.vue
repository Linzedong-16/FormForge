<template>
  <ButtonGroup
    :title="`${configKey === 'titleWeight' ? t('components.weightEditor.title') : t('components.weightEditor.desc')}${t('components.weightEditor.bold')}`"
    :status="status[currentStatus]"
  >
    <el-button-group>
      <el-button
        :class="{
          select: currentStatus === 0
        }"
        @click="changeFontWeight(0)"
      >
        <font-awesome-icon icon="bold" size="lg" />
      </el-button>
      <el-button
        :class="{
          select: currentStatus === 1
        }"
        @click="changeFontWeight(1)"
      >
        <font-awesome-icon icon="bold" size="xs" />
      </el-button>
    </el-button-group>
  </ButtonGroup>
</template>

<script setup lang="ts">
import type { VueComType, UpdateStatus } from "@/types";
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
function changeFontWeight(pos: number) {
  if (updateStatus) {
    updateStatus(props.configKey, pos);
  } else {
    console.warn("updateStatus is not provided");
  }
}
</script>
