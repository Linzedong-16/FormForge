<template>
  <teleport to="body">
    <transition name="cropper-fade">
      <div v-if="modelValue" class="cropper-modal-overlay" @click.self="handleCancel">
        <div class="cropper-modal-card" role="dialog" aria-modal="true">
          <!-- ── 头部 ──────────────────────────────────── -->
          <header class="cropper-modal-header">
            <h3 class="cropper-modal-title">{{ title }}</h3>
            <button class="cropper-modal-close" aria-label="关闭" @click="handleCancel">
              <el-icon :size="18"><Close /></el-icon>
            </button>
          </header>

          <!-- ── 主体：裁剪区 + 预览区 ──────────────────── -->
          <div class="cropper-modal-body">
            <!-- 左侧裁剪区 -->
            <div class="cropper-main">
              <div class="cropper-container">
                <CropperBox
                  ref="cropperRef"
                  :image-url="imageUrl"
                  :crop-size="240"
                  :output-size="200"
                  output-type="png"
                  @load="handleImgLoad"
                  @update="handleCropUpdate"
                />
              </div>
              <!-- 缩放与旋转控制 -->
              <div class="cropper-toolbar">
                <button class="tool-btn" title="缩小" @click="handleZoomOut">
                  <el-icon :size="16"><ZoomOut /></el-icon>
                </button>
                <input
                  type="range"
                  class="zoom-slider"
                  min="0.1"
                  max="4"
                  step="0.01"
                  :value="currentScale"
                  @input="handleScaleChange"
                />
                <button class="tool-btn" title="放大" @click="handleZoomIn">
                  <el-icon :size="16"><ZoomIn /></el-icon>
                </button>
                <button class="tool-btn rotate-btn" title="向左旋转" @click="handleRotateLeft">
                  <el-icon :size="16"><RefreshLeft /></el-icon>
                </button>
                <button class="tool-btn rotate-btn" title="向右旋转" @click="handleRotateRight">
                  <el-icon :size="16"><RefreshRight /></el-icon>
                </button>
              </div>
            </div>

            <!-- 右侧预览区 -->
            <div class="cropper-preview-panel">
              <p class="preview-label">{{ t("settings.cropPreview") }}</p>
              <div class="preview-avatar-wrap">
                <div class="preview-avatar">
                  <img v-if="cropState" :src="imageUrl" :style="previewImgStyle" class="preview-img" alt="preview" />
                </div>
              </div>
              <p class="preview-tip">{{ t("settings.cropPreviewTip") }}</p>
            </div>
          </div>

          <!-- ── 底部操作 ──────────────────────────────── -->
          <footer class="cropper-modal-footer">
            <el-button size="large" @click="handleCancel">
              {{ t("settings.cancel") }}
            </el-button>
            <el-button type="primary" size="large" :loading="confirming" @click="handleConfirm">
              {{ t("settings.confirm") }}
            </el-button>
          </footer>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Close, ZoomIn, ZoomOut, RefreshLeft, RefreshRight } from "@element-plus/icons-vue";
import { CropperBox } from "monorepo-code-components";
import type { CropState } from "monorepo-code-components";

const { t } = useI18n();

// ── Props ──────────────────────────────────────────────
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    imageUrl: string;
    title?: string;
  }>(),
  { title: "" }
);

// ── Emits ──────────────────────────────────────────────
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "confirm", blob: Blob, dataUrl: string): void;
  (e: "cancel"): void;
}>();

const title = computed(() => props.title || t("settings.cropAvatar"));

// ── 状态 ───────────────────────────────────────────────
const cropperRef = ref<InstanceType<typeof CropperBox> | null>(null);
const confirming = ref(false);
const imgLoaded = ref(false);
const currentScale = ref(1);
const cropState = ref<CropState | null>(null);

// ── 实时预览图片样式 ───────────────────────────────────
const previewImgStyle = computed(() => {
  const cs = cropState.value;
  if (!cs) return { display: "none" };

  const previewSize = 120; // 预览圆直径
  const scaleRatio = previewSize / cs.cropSize;
  const combinedScale = cs.scale * scaleRatio;
  // 将容器坐标偏移映射到预览坐标系（符号保持一致：图片右移 → 预览中也右移）
  const offsetX = cs.x * scaleRatio;
  const offsetY = cs.y * scaleRatio;

  return {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    width: `${cs.imgW}px`,
    height: `${cs.imgH}px`,
    transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${combinedScale}) rotate(${cs.rotation}deg)`,
    transformOrigin: "center center",
    pointerEvents: "none" as const
  };
});

// ── 裁剪状态更新回调 ───────────────────────────────────
function handleCropUpdate(state: CropState) {
  cropState.value = state;
  currentScale.value = state.scale;
}

// ── 图片加载回调 ───────────────────────────────────────
function handleImgLoad(status: "success" | "error") {
  imgLoaded.value = status === "success";
}

// ── 缩放控制 ───────────────────────────────────────────
function handleZoomIn() {
  const s = (cropperRef.value?.getScale() ?? currentScale.value) + 0.1;
  cropperRef.value?.setScale(s);
}

function handleZoomOut() {
  const s = (cropperRef.value?.getScale() ?? currentScale.value) - 0.1;
  cropperRef.value?.setScale(s);
}

function handleScaleChange(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  cropperRef.value?.setScale(val);
}

// ── 旋转控制 ───────────────────────────────────────────
function handleRotateLeft() {
  cropperRef.value?.rotateLeft();
}

function handleRotateRight() {
  cropperRef.value?.rotateRight();
}

// ── 取消 ───────────────────────────────────────────────
function handleCancel() {
  if (confirming.value) return;
  emit("update:modelValue", false);
  emit("cancel");
}

// ── 确认裁剪 ───────────────────────────────────────────
async function handleConfirm() {
  if (!cropperRef.value) return;
  confirming.value = true;
  try {
    const [blob, dataUrl] = await Promise.all([cropperRef.value.getCropBlob(), cropperRef.value.getCropDataUrl()]);
    emit("confirm", blob, dataUrl);
  } finally {
    confirming.value = false;
  }
}

// ── 弹窗打开时重置状态 ─────────────────────────────────
watch(
  () => props.modelValue,
  val => {
    if (val) {
      confirming.value = false;
      imgLoaded.value = false;
      currentScale.value = 1;
      cropState.value = null;
    }
  }
);
</script>

<style scoped lang="scss">
// ── 主题变量映射 ───────────────────────────────────────
$clr-card: var(--white, #ffffff);
$clr-text: var(--font-color, #18181b);
$clr-text-secondary: var(--font-color-lighter, #71717a);
$clr-text-lightest: var(--font-color-lightest, #d4d4d8);
$clr-border: var(--border-color, #e4e4e7);
$clr-primary: var(--primary-color, #18181b);
$clr-fill-light: var(--el-fill-color-light, #f4f4f5);
$radius-lg: var(--border-radius-lg, 8px);
$radius-md: var(--border-radius-md, 6px);

// ── 遮罩层 ─────────────────────────────────────────────
.cropper-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}

// ── 弹窗卡片 ───────────────────────────────────────────
.cropper-modal-card {
  position: relative;
  width: 720px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: $clr-card;
  border-radius: $radius-lg;
  border: 1px solid $clr-border;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  outline: none;
}

// ── 头部 ───────────────────────────────────────────────
.cropper-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid $clr-border;
}

.cropper-modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: $clr-text;
}

.cropper-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: $clr-text-secondary;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: $clr-fill-light;
    color: $clr-text;
  }
}

// ── 主体区域 ───────────────────────────────────────────
.cropper-modal-body {
  display: flex;
  gap: 24px;
  padding: 24px;
  flex: 1;
  min-height: 0;
}

.cropper-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cropper-container {
  width: 100%;
  aspect-ratio: 1 / 1;
  max-width: 420px;
  border-radius: $radius-md;
  overflow: hidden;
}

// ── 工具栏 ─────────────────────────────────────────────
.cropper-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-top: 4px;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid $clr-border;
  border-radius: 6px;
  background: $clr-card;
  color: $clr-text-secondary;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    background: $clr-fill-light;
    color: $clr-text;
  }

  &.rotate-btn {
    margin-left: 4px;
  }
}

.zoom-slider {
  width: 80px;
  height: 4px;
  appearance: none;
  background: $clr-border;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  accent-color: $clr-primary;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: $clr-primary;
    cursor: pointer;
    border: 2px solid $clr-card;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: $clr-primary;
    cursor: pointer;
    border: 2px solid $clr-card;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
}

// ── 右侧预览区 ─────────────────────────────────────────
.cropper-preview-panel {
  width: 160px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
}

.preview-label {
  font-size: 13px;
  color: $clr-text-secondary;
  margin: 0;
}

.preview-avatar-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  position: relative;
  border: 3px solid $clr-border;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  // 棋盘格背景，透明区域可见
  background-color: #f0f0f0;
  background-image:
    linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
  background-size: 8px 8px;
  background-position:
    0 0,
    0 4px,
    4px -4px,
    -4px 0;
}

.preview-img {
  pointer-events: none;
  will-change: transform;
}

.preview-tip {
  font-size: 11px;
  color: $clr-text-lightest;
  text-align: center;
  margin: 0;
  line-height: 1.5;
}

// ── 底部操作 ───────────────────────────────────────────
.cropper-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px 20px;
  border-top: 1px solid $clr-border;
}

// ── 过渡动画 ───────────────────────────────────────────
.cropper-fade-enter-active,
.cropper-fade-leave-active {
  transition: opacity 0.2s ease;

  .cropper-modal-card {
    transition:
      transform 0.2s ease,
      opacity 0.2s ease;
  }
}

.cropper-fade-enter-from,
.cropper-fade-leave-to {
  opacity: 0;

  .cropper-modal-card {
    transform: scale(0.95);
    opacity: 0;
  }
}

// ── 响应式 ─────────────────────────────────────────────
@media (max-width: 600px) {
  .cropper-modal-card {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    border-radius: $radius-md;
  }

  .cropper-modal-body {
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }

  .cropper-preview-panel {
    width: 100%;
    flex-direction: row;
    gap: 12px;
  }

  .preview-avatar {
    width: 64px;
    height: 64px;
  }
}
</style>
