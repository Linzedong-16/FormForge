<template>
  <div
    ref="containerRef"
    class="cropper-box"
    @wheel.prevent="handleWheel"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- 棋盘格背景 -->
    <div class="cropper-bg"></div>

    <!-- 图片层（始终渲染以触发 @load 事件） -->
    <img
      ref="imgRef"
      :src="imageUrl"
      :style="imgStyle"
      class="cropper-img"
      :class="{ 'img-ready': loaded }"
      draggable="false"
      alt="cropper image"
      @load="handleImgLoad"
      @error="handleImgError"
    />

    <!-- 加载中状态 -->
    <div v-if="!loaded" class="cropper-loading">
      <el-icon class="loading-icon" :size="32"><Loading /></el-icon>
    </div>

    <!-- 圆形遮罩层 -->
    <div class="crop-mask" :style="maskStyle">
      <!-- 裁剪框边框 -->
      <div class="crop-border"></div>
    </div>

    <!-- 旋转角度提示（旋转时显示） -->
    <div v-if="rotation % 360 !== 0" class="rotate-badge">{{ ((rotation % 360) + 360) % 360 }}°</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { Loading } from "@element-plus/icons-vue";

// ── Props ──────────────────────────────────────────────
const props = withDefaults(
  defineProps<{
    /** 待裁剪图片 URL */
    imageUrl: string;
    /** 圆形裁剪框直径（px） */
    cropSize?: number;
    /** 输出图片尺寸（px） */
    outputSize?: number;
    /** 输出图片格式 */
    outputType?: "png" | "jpeg" | "webp";
    /** 输出图片质量 0-1 */
    outputQuality?: number;
  }>(),
  {
    cropSize: 240,
    outputSize: 200,
    outputType: "png",
    outputQuality: 0.92
  }
);

// ── Emits ──────────────────────────────────────────────
const emit = defineEmits<{
  /** 图片加载完成 */
  (e: "load", status: "success" | "error"): void;
  /** 实时预览数据更新 */
  (e: "update", data: CropState): void;
}>();

// 导出给父组件使用的裁剪状态类型
export interface CropState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  containerW: number;
  containerH: number;
  cropSize: number;
  imgW: number;
  imgH: number;
}

// ── 模板 refs ──────────────────────────────────────────
const containerRef = ref<HTMLDivElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);

// ── 状态 ───────────────────────────────────────────────
const loaded = ref(false);
const imgNaturalW = ref(0);
const imgNaturalH = ref(0);
const containerW = ref(0);
const containerH = ref(0);

// 图片变换状态
const posX = ref(0); // 图片相对于容器中心的偏移 x
const posY = ref(0); // 图片相对于容器中心的偏移 y
const scale = ref(1);
const rotation = ref(0); // 顺时针旋转角度

// 拖拽状态
const dragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const dragStartPosX = ref(0);
const dragStartPosY = ref(0);

// 双指缩放状态
const pinchStartDist = ref(0);
const pinchStartScale = ref(1);

// ── 计算属性 ───────────────────────────────────────────
/** 图片渲染样式 */
const imgStyle = computed(() => ({
  position: "absolute" as const,
  top: "50%",
  left: "50%",
  width: `${imgNaturalW.value}px`,
  height: `${imgNaturalH.value}px`,
  transform: `translate(-50%, -50%) translate(${posX.value}px, ${posY.value}px) scale(${scale.value}) rotate(${rotation.value}deg)`,
  transformOrigin: "center center",
  pointerEvents: "none" as const
}));

/** 遮罩层样式 */
const maskStyle = computed(() => ({
  position: "absolute" as const,
  top: "50%",
  left: "50%",
  width: `${props.cropSize}px`,
  height: `${props.cropSize}px`,
  marginLeft: `-${props.cropSize / 2}px`,
  marginTop: `-${props.cropSize / 2}px`,
  borderRadius: "50%",
  boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.55)`,
  pointerEvents: "none" as const
}));

// ── 初始化容器尺寸 ────────────────────────────────────
function initContainerSize() {
  if (!containerRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  containerW.value = rect.width;
  containerH.value = rect.height;
}

// ── 图片加载 ──────────────────────────────────────────
function handleImgLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  imgNaturalW.value = img.naturalWidth;
  imgNaturalH.value = img.naturalHeight;
  loaded.value = true;

  // 初始化：图片缩放到刚好覆盖裁剪框
  initContainerSize();
  resetPosition();
  emit("load", "success");
  emitUpdate();
}

function handleImgError() {
  emit("load", "error");
}

// ── 重置位置：图片居中，缩放至覆盖裁剪框的最小比例 ──────
function resetPosition() {
  if (imgNaturalW.value === 0 || containerW.value === 0) return;

  // 计算使图片至少覆盖裁剪框的最小缩放
  const cropDiam = props.cropSize;
  const scaleW = cropDiam / imgNaturalW.value;
  const scaleH = cropDiam / imgNaturalH.value;
  scale.value = Math.max(scaleW, scaleH, 0.5);

  // 图片居中
  posX.value = 0;
  posY.value = 0;
  rotation.value = 0;
}

// ── 发送预览数据 ──────────────────────────────────────
let updateTimer: ReturnType<typeof setTimeout> | null = null;
function emitUpdate() {
  if (updateTimer) return;
  updateTimer = setTimeout(() => {
    updateTimer = null;
    emit("update", {
      x: posX.value,
      y: posY.value,
      scale: scale.value,
      rotation: rotation.value,
      containerW: containerW.value,
      containerH: containerH.value,
      cropSize: props.cropSize,
      imgW: imgNaturalW.value,
      imgH: imgNaturalH.value
    });
  }, 16); // ~60fps 节流
}

// ── 鼠标事件 ──────────────────────────────────────────
function handleMouseDown(e: MouseEvent) {
  if (!loaded.value) return;
  e.preventDefault();
  dragging.value = true;
  dragStartX.value = e.clientX;
  dragStartY.value = e.clientY;
  dragStartPosX.value = posX.value;
  dragStartPosY.value = posY.value;
}

function handleMouseMove(e: MouseEvent) {
  if (!dragging.value) return;
  const dx = e.clientX - dragStartX.value;
  const dy = e.clientY - dragStartY.value;
  posX.value = dragStartPosX.value + dx / scale.value;
  posY.value = dragStartPosY.value + dy / scale.value;
  emitUpdate();
}

function handleMouseUp() {
  dragging.value = false;
}

// ── 滚轮缩放 ──────────────────────────────────────────
function handleWheel(e: WheelEvent) {
  if (!loaded.value) return;
  const delta = e.deltaY > 0 ? -0.05 : 0.05;
  // 最小缩放 0.1：保证高分辨率图片也能缩到裁剪框内，让用户框选更多画面内容
  const newScale = Math.max(0.1, Math.min(5, scale.value + delta));
  scale.value = newScale;
  emitUpdate();
}

// ── 触摸事件（双指缩放） ──────────────────────────────
function handleTouchStart(e: TouchEvent) {
  if (!loaded.value) return;
  if (e.touches.length === 2) {
    // 双指缩放
    pinchStartDist.value = getTouchDistance(e);
    pinchStartScale.value = scale.value;
  } else if (e.touches.length === 1) {
    // 单指拖拽
    const touch = e.touches[0]!;
    dragging.value = true;
    dragStartX.value = touch.clientX;
    dragStartY.value = touch.clientY;
    dragStartPosX.value = posX.value;
    dragStartPosY.value = posY.value;
  }
}

function handleTouchMove(e: TouchEvent) {
  if (e.touches.length === 2) {
    // 双指缩放
    const dist = getTouchDistance(e);
    const newScale = pinchStartScale.value * (dist / pinchStartDist.value);
    // 最小缩放 0.1：保证高分辨率图片也能缩到裁剪框内，让用户框选更多画面内容
    scale.value = Math.max(0.1, Math.min(5, newScale));
    emitUpdate();
  } else if (e.touches.length === 1 && dragging.value) {
    const touch = e.touches[0]!;
    const dx = touch.clientX - dragStartX.value;
    const dy = touch.clientY - dragStartY.value;
    posX.value = dragStartPosX.value + dx / scale.value;
    posY.value = dragStartPosY.value + dy / scale.value;
    emitUpdate();
  }
}

function handleTouchEnd() {
  dragging.value = false;
}

function getTouchDistance(e: TouchEvent): number {
  if (e.touches.length < 2) return 0;
  const t0 = e.touches[0]!;
  const t1 = e.touches[1]!;
  const dx = t0.clientX - t1.clientX;
  const dy = t0.clientY - t1.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── 公开方法 ──────────────────────────────────────────

/** 获取裁剪后的 Blob */
function getCropBlob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = renderCropToCanvas();
    if (!canvas) {
      reject(new Error("无法生成裁剪结果"));
      return;
    }
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error("Blob 生成失败"));
      },
      `image/${props.outputType}`,
      props.outputQuality
    );
  });
}

/** 获取裁剪后的 DataURL */
function getCropDataUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = renderCropToCanvas();
    if (!canvas) {
      reject(new Error("无法生成裁剪结果"));
      return;
    }
    resolve(canvas.toDataURL(`image/${props.outputType}`, props.outputQuality));
  });
}

/** 将裁剪区域渲染到 Canvas（复现 CSS 变换链，精确导出所见内容） */
function renderCropToCanvas(): HTMLCanvasElement | null {
  const img = imgRef.value;
  if (!img || !loaded.value) return null;

  const outSize = props.outputSize;
  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // 圆形裁剪路径（canvas 原点在左上角）
  ctx.beginPath();
  ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
  ctx.clip();

  // Canvas 变换链：复现 CSS 中图片的渲染变换
  // CSS 变换：translate(-50%,-50%) translate(posX,posY) scale(s) rotate(r)
  // 映射关系：裁剪框中心（容器中心）→ canvas 中心
  const canvasScale = outSize / props.cropSize;

  ctx.save();

  // 1. 原点移至 canvas 中心（对应裁剪框中心）
  ctx.translate(outSize / 2, outSize / 2);

  // 2. 缩放：容器坐标 → canvas 坐标
  ctx.scale(canvasScale, canvasScale);

  // 3. 图片偏移（容器坐标）
  ctx.translate(posX.value, posY.value);

  // 4. 图片缩放
  ctx.scale(scale.value, scale.value);

  // 5. 图片旋转（顺时针角度）
  if (rotation.value % 360 !== 0) {
    const rad = (rotation.value * Math.PI) / 180;
    ctx.rotate(rad);
  }

  // 6. 绘制图片（以图片中心为原点）
  ctx.drawImage(img, -imgNaturalW.value / 2, -imgNaturalH.value / 2, imgNaturalW.value, imgNaturalH.value);

  ctx.restore();

  return canvas;
}

/** 设置缩放级别 */
function setScale(s: number) {
  // 最小缩放 0.1：保证高分辨率图片也能缩到裁剪框内，让用户框选更多画面内容
  scale.value = Math.max(0.1, Math.min(5, s));
  emitUpdate();
}

/** 向左旋转 90° */
function rotateLeft() {
  rotation.value = (rotation.value - 90) % 360;
  emitUpdate();
}

/** 向右旋转 90° */
function rotateRight() {
  rotation.value = (rotation.value + 90) % 360;
  emitUpdate();
}

/** 获取当前缩放值 */
function getScale(): number {
  return scale.value;
}

/** 获取当前旋转角度 */
function getRotation(): number {
  return rotation.value;
}

defineExpose({
  getCropBlob,
  getCropDataUrl,
  setScale,
  rotateLeft,
  rotateRight,
  getScale,
  getRotation
});

// ── 生命周期 ──────────────────────────────────────────
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  initContainerSize();
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      initContainerSize();
    });
    resizeObserver.observe(containerRef.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

// 监听 imageUrl 变化，重置状态
watch(
  () => props.imageUrl,
  () => {
    loaded.value = false;
    imgNaturalW.value = 0;
    imgNaturalH.value = 0;
    posX.value = 0;
    posY.value = 0;
    scale.value = 1;
    rotation.value = 0;
  }
);
</script>

<style scoped lang="scss">
.cropper-box {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }
}

// 棋盘格背景
.cropper-bg {
  position: absolute;
  inset: 0;
  background-color: #f0f0f0;
  background-image:
    linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
}

.cropper-img {
  pointer-events: none;
  will-change: transform;
  // 图片未加载时隐藏，避免显示残缺图像
  opacity: 0;
  transition: opacity 0.15s ease;

  &.img-ready {
    opacity: 1;
  }
}

// 裁剪框边框 — 双线效果：外部深色细线 + 内部白色粗线
.crop-border {
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.3),
    inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  pointer-events: none;
}

// 加载中
.cropper-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

// 旋转角标
.rotate-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  pointer-events: none;
}
</style>
