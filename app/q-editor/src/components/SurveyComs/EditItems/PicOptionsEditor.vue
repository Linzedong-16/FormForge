<template>
  <div>
    <div class="flex align-items-center">
      <div class="mr-10">{{ t("components.picOptionsEditor.questionOptions") }}</div>
      <el-button size="small" :icon="Plus" circle @click="addOptionHandle" />
    </div>
    <div v-for="(item, index) in textArr" :key="index">
      <!-- 选项 -->
      <div class="title mt-10 mb-10 flex align-items-center">
        <span>{{ t("components.picOptionsEditor.option") }}{{ index + 1 }}</span>
        <el-button
          type="danger"
          class="ml-5 delete"
          size="small"
          :icon="Minus"
          circle
          @click="removeOptionHandle(index)"
        />
      </div>
      <!-- 是否上传图片 -->
      <div class="mb-5">
        <div v-if="item.value" class="flex">
          <span class="title mr-5">{{ t("components.picOptionsEditor.uploaded") }}</span>
          <el-link type="primary" @click="deletePic(index)">{{ t("components.picOptionsEditor.deletePic") }}</el-link>
        </div>
        <span v-else class="title">{{ t("components.picOptionsEditor.notUploaded") }}</span>
      </div>
      <!-- 修改图片标题 -->
      <el-input v-model="item.picTitle" class="mb-5" :placeholder="t('components.picOptionsEditor.picTitle')" />
      <!-- 修改图片描述 -->
      <el-input
        v-model="item.picDesc"
        type="textarea"
        :rows="3"
        :placeholder="t('components.picOptionsEditor.picDesc')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, Minus } from "@element-plus/icons-vue";
import type { VueComType, PicTitleDescStatusArr, PicLink } from "@/types";
import { ElMessage, ElMessageBox } from "element-plus";

const { t } = useI18n();

const props = defineProps<{
  currentStatus: number;
  status: PicTitleDescStatusArr;
  isShow: boolean;
  configKey: string;
  editCom: VueComType;
  id: string;
}>();
const textArr = computed(() => props.status);
interface UpdateStatusFn {
  (key: string, payload?: number | PicLink): void;
}
const updateStatus = inject("updateStatus") as UpdateStatusFn;

/**
 * 添加选项
 */
const addOptionHandle = () => {
  if (updateStatus) {
    updateStatus(props.configKey);
  }
};

/**
 * 删除选项
 */
const removeOptionHandle = (index: number) => {
  if (updateStatus) {
    updateStatus(props.configKey, index);
  }
};

/**
 * 删除图片
 */
const deletePic = (index: number) => {
  ElMessageBox.confirm(t("components.picOptionsEditor.deleteConfirm"), t("components.picOptionsEditor.warning"), {
    confirmButtonText: t("components.picOptionsEditor.confirm"),
    cancelButtonText: t("components.picOptionsEditor.cancel"),
    type: "warning"
  })
    .then(() => {
      // 确认删除
      if (updateStatus) {
        updateStatus(props.configKey, {
          link: "",
          index
        });
      }

      ElMessage.success(t("components.picOptionsEditor.deleteSuccess"));
    })
    .catch(() => {
      // 取消删除
      ElMessage.info(t("components.picOptionsEditor.deleteCanceled"));
    });
};
</script>

<style scoped lang="scss">
.title {
  color: var(--font-color-light);
  font-size: var(--font-size-base);
}
.delete {
  transform: scale(0.8);
}
</style>
