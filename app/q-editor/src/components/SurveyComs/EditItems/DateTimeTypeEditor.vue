<template>
  <ButtonGroup :title="t('components.dateTimeTypeEditor.dateType')" :status="status[currentStatus]!.status">
    <el-select :placeholder="t('components.dateTimeTypeEditor.dateType')" style="width: 100px" @change="changeType">
      <el-option v-for="item in status" :key="item.value" :label="item.status" :value="item.value" />
    </el-select>
  </ButtonGroup>
</template>

<script setup lang="ts">
import type { VueComType, UpdateStatus, ValueStatusArr } from "@/types";
import { inject } from "vue";
import { useI18n } from "vue-i18n";
import ButtonGroup from "./ButtonGroup.vue";

const { t } = useI18n();

const updateStatus = inject<UpdateStatus>("updateStatus");
const props = defineProps<{
  currentStatus: number;
  status: ValueStatusArr;
  isShow: boolean;
  configKey: string;
  editCom: VueComType;
}>();
const typeArr = props.status.map(item => item.value);
function changeType(newVal: string) {
  if (updateStatus) {
    const payload = typeArr.indexOf(newVal);
    updateStatus(props.configKey, payload, true);
  } else {
    console.warn("updateStatus is not provided");
  }
}
</script>
