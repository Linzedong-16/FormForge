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
import { uploadAvatar } from "@/api/modules/settings";
import { useUserStore } from "@/stores/useUser";

const { t } = useI18n();

const userStore = useUserStore();

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
const uploading = ref(false);
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
async function handleCropConfirm(blob: Blob, dataUrl: string) {
  cropperVisible.value = false;

  // 先更新本地预览
  emit("update:modelValue", dataUrl);

  // 上传到后端
  uploading.value = true;
  try {
    const filename = pendingFile.value?.name ?? "avatar.png";
    const res = await uploadAvatar(blob, filename);
    if (res.code === 0 && res.data) {
      // 使用后端返回的 CDN URL（高清原图）
      emit("update:modelValue", res.data.avatarUrl);
      // 同步到 Pinia store，所有依赖组件实时响应
      userStore.setProfile({ avatarUrl: res.data.avatarUrl });
      ElMessage.success(t("settings.avatarUploadSuccess"));
    }
  } catch {
    // 上传失败不回退预览（用户可重试）
    ElMessage.error(t("settings.saveFailed"));
  } finally {
    uploading.value = false;
    cleanupPreview();
  }
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
