<template>
  <a-modal :visible="visible" title="上传物料" width="480px" :mask-closable="false" @cancel="handleClose">
    <a-form :model="form" layout="vertical">
      <a-form-item label="图片文件">
        <a-upload
          :file-list="fileList"
          :limit="1"
          accept="image/*"
          :auto-upload="false"
          :show-remove-button="true"
          @change="handleFileChange"
        />
        <div class="upload-hint">当前阶段仅支持图片类型文件</div>
      </a-form-item>
      <a-form-item label="关联问卷 ID（可选）">
        <a-input v-model="form.survey_id" placeholder="留空表示不关联任何问卷" allow-clear />
      </a-form-item>
    </a-form>

    <template #footer>
      <a-button @click="handleClose">取消</a-button>
      <a-button type="primary" :loading="uploading" :disabled="fileList.length === 0" @click="handleUpload">
        上传
      </a-button>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from "vue";
import { Message } from "@arco-design/web-vue";
import type { FileItem } from "@arco-design/web-vue";
import { uploadMediaAsset } from "@/api/modules/media-asset";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ "update:visible": [boolean]; uploaded: [] }>();

const fileList = ref<FileItem[]>([]);
const form = reactive({ survey_id: "" });
const uploading = ref(false);

watch(
  () => props.visible,
  visible => {
    if (!visible) {
      fileList.value = [];
      form.survey_id = "";
    }
  }
);

function handleFileChange(files: FileItem[]) {
  fileList.value = files;
}

async function handleUpload() {
  const target = fileList.value[0]?.file;
  if (!target) {
    Message.error("请选择要上传的文件");
    return;
  }

  uploading.value = true;
  try {
    const formData = new FormData();
    formData.append("file", target);
    if (form.survey_id) {
      formData.append("survey_id", form.survey_id);
    }

    const res = await uploadMediaAsset(formData);
    if (res.data) {
      Message.success("上传成功");
      emit("uploaded");
      handleClose();
    }
  } catch (err: unknown) {
    // 非图片类型（415）等错误信息由后端 msg 给出，此处统一展示
    const msg = err instanceof Error ? err.message : "上传失败";
    Message.error(msg);
  } finally {
    uploading.value = false;
  }
}

function handleClose() {
  emit("update:visible", false);
}
</script>

<style scoped>
.upload-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-3);
}
</style>
