<template>
  <div class="avatar-upload">
    <div class="avatar-preview" @click="triggerUpload">
      <el-avatar :size="80" :src="modelValue || defaultAvatar" class="avatar-img" />
      <div class="avatar-overlay">
        <el-icon :size="20"><Camera /></el-icon>
        <span class="overlay-text">{{ t("settings.changeAvatar") }}</span>
      </div>
    </div>

    <div class="avatar-tips">
      <p>{{ t("settings.avatarTip") }}</p>
      <p class="avatar-format">{{ t("settings.avatarFormat") }}</p>
    </div>

    <!-- 隐藏的文件上传 input -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      class="file-input-hidden"
      @change="handleFileChange"
    />

    <!-- 裁剪弹窗 -->
    <CropperModal
      v-model="cropperVisible"
      :image-url="previewUrl"
      @confirm="handleCropConfirm"
      @cancel="handleCropCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { Camera } from "@element-plus/icons-vue";
import CropperModal from "./CropperModal.vue";

const { t } = useI18n();

// ── Props & Emits ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

// ── 状态 ────────────────────────────────────────────
const defaultAvatar = "http://47.94.168.252/upload/1759642363899.gif";
const fileInputRef = ref<HTMLInputElement | null>(null);
const cropperVisible = ref(false);
const previewUrl = ref("");
const pendingFile = ref<File | null>(null); // 待裁剪的原始文件

// ── 触发文件选择 ────────────────────────────────────
function triggerUpload() {
  fileInputRef.value?.click();
}

// ── 文件选择处理 ────────────────────────────────────
function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // 校验文件类型
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    ElMessage.warning(t("settings.avatarFormatError"));
    return;
  }

  // 校验文件大小（最大 5MB）
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning(t("settings.avatarSizeError"));
    return;
  }

  // 生成预览 URL 并打开裁剪弹窗
  previewUrl.value = URL.createObjectURL(file);
  pendingFile.value = file;
  cropperVisible.value = true;

  // 重置 input 以允许重复选择同一文件
  input.value = "";
}

// ── 裁剪确认 ────────────────────────────────────────
// blob: 裁剪后的图片 Blob，dataUrl: 裁剪后的 base64 预览 URL
function handleCropConfirm(_blob: Blob, dataUrl: string) {
  cropperVisible.value = false;
  // 使用裁剪后的 dataUrl 更新头像预览
  emit("update:modelValue", dataUrl);
  // TODO: 后续对接 API 时，使用 blob 上传到服务器
  // await uploadImage(blob);
  ElMessage.success(t("settings.avatarUploadSuccess"));
  // 清理临时数据
  cleanupPreview();
}

// ── 裁剪取消 ────────────────────────────────────────
function handleCropCancel() {
  cleanupPreview();
}

// ── 清理预览资源 ────────────────────────────────────
function cleanupPreview() {
  if (previewUrl.value && previewUrl.value.startsWith("blob:")) {
    URL.revokeObjectURL(previewUrl.value);
  }
  previewUrl.value = "";
  pendingFile.value = null;
}
</script>

<style scoped lang="scss">
// ── 本地 fallback：引用项目主题系统变量，确保亮/暗主题下均有可读的对比度 ──
$clr-text-secondary: var(--font-color-lighter, #71717a);
$clr-text-light: var(--font-color-light, #3f3f46);

.avatar-upload {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

.avatar-preview {
  position: relative;
  cursor: pointer;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;

  .avatar-img {
    display: block;
  }

  .avatar-overlay {
    position: absolute;
    inset: 0;
    // 半透明黑色遮罩 + 白色文字：无论亮暗主题，对比度始终 >= 4.5:1
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: #ffffff;
    opacity: 0;
    transition: opacity 0.2s ease;
    border-radius: 50%;
  }

  &:hover .avatar-overlay {
    opacity: 1;
  }

  .overlay-text {
    font-size: 11px;
    white-space: nowrap;
  }
}

.avatar-tips {
  font-size: 12px;
  color: $clr-text-secondary;
  line-height: 1.6;

  p {
    margin: 0;
  }

  .avatar-format {
    color: $clr-text-light;
  }
}

.file-input-hidden {
  display: none;
}
</style>
