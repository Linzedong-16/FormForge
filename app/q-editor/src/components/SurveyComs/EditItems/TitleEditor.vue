<template>
  <div key="id">
    <div class="mb-10">{{ t("components.titleEditor.titleContent") }}</div>
    <el-input v-model="text" :placeholder="t('components.titleEditor.placeholder')" @update:model-value="inputHandle" />
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from "vue";
import { useI18n } from "vue-i18n";
import type { VueComType } from "@/types";

const { t } = useI18n();

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
