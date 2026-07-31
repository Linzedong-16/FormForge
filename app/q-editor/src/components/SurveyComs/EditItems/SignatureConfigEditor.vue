<template>
  <!-- 通用 OptionsProps 选项按钮编辑器，用于签名题的 strokeWidth 和 showToolbar 配置 -->
  <div class="sig-config-editor flex align-items-center space-between">
    <!-- 文字过长时靠原生 title 兜底显示全名 -->
    <div class="label-text mr-10" :title="label">{{ label }}</div>
    <div class="options-wrap">
      <el-button
        v-for="(opt, idx) in props.status"
        :key="idx"
        size="small"
        :type="idx === props.currentStatus ? 'primary' : 'default'"
        class="opt-btn"
        @click="selectOption(idx)"
      >
        {{ opt }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import type { VueComType, UpdateStatus } from "@/types";

const { t } = useI18n();

const props = defineProps<{
  status: string[];
  isShow: boolean;
  currentStatus: number;
  configKey: string;
  editCom: VueComType;
  id: string;
  name: string;
}>();

const updateStatus = inject<UpdateStatus>("updateStatus");

// 根据 configKey 显示对应的中文标签
const label = computed(() => {
  if (props.configKey === "strokeWidth") return t("components.signatureConfigEditor.strokeWidth");
  if (props.configKey === "showToolbar") return t("components.signatureConfigEditor.showToolbar");
  return props.configKey;
});

// 点击选项时更新 currentStatus（传 number 索引触发 OptionsProps 更新）
const selectOption = (index: number) => {
  updateStatus?.(props.configKey, index);
};
</script>

<style scoped lang="scss">
.label-text {
  color: var(--font-color-light);
  font-size: var(--font-size-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.options-wrap {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.opt-btn {
  padding: 0 8px;
}
</style>
