<template>
  <div :class="{ 'text-center': computedState.position }">
    <MaterialsHeader
      :serial-num="serialNum"
      :title="computedState.title"
      :title-size="computedState.titleSize"
      :title-weight="computedState.titleWeight"
      :title-italic="computedState.titleItalic"
      :title-color="computedState.titleColor"
      :desc="computedState.desc"
      :desc-size="computedState.descSize"
      :desc-weight="computedState.descWeight"
      :desc-italic="computedState.descItalic"
      :desc-color="computedState.descColor"
    />

    <!-- 签名区域，阻止编辑器点击事件冒泡 -->
    <div class="signature-wrap" @click.stop>
      <!-- Canvas 画布：touch-action: none 防止移动端滚动干扰 -->
      <canvas
        ref="canvasRef"
        class="signature-canvas"
        @mousedown="startDraw"
        @mousemove="drawing"
        @mouseup="endDraw"
        @mouseleave="endDraw"
        @touchstart.prevent="startDrawTouch"
        @touchmove.prevent="drawingTouch"
        @touchend="endDraw"
      />

      <!-- 工具栏：根据 showToolbar 配置显隐 -->
      <div v-if="computedState.showToolbar" class="signature-toolbar">
        <el-button size="small" plain @click="undoDraw">
          {{ t("components.signature.undo") }}
        </el-button>
        <el-button size="small" plain @click="clearCanvas">
          {{ t("components.signature.clear") }}
        </el-button>
        <span v-if="uploading" class="signed-hint is-uploading">
          {{ t("components.signature.uploading") }}
        </span>
        <span v-else class="signed-hint" :class="{ 'is-signed': isSigned }">
          {{ isSigned ? t("components.signature.signed") : t("components.signature.unsigned") }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { useEditorStore } from "@/stores/useEditor";
import { uploadSignature } from "@/api/upload";
import { getTextStatus, getStringStatusByCurrentStatus, getCurrentStatus } from "@/utils";
import MaterialsHeader from "@/components/SurveyComs/Common/MaterialsHeader.vue";
import type { SignatureStatus } from "@/types";

const { t } = useI18n();
const editorStore = useEditorStore();

const props = defineProps<{
  status: SignatureStatus;
  serialNum: number;
}>();

const emits = defineEmits(["updateAnswer"]);

/** 函数式 surveyId 获取器：优先 from Center/SurveyView provide，回退到 store */
const getSurveyId = inject<() => string | null>("getSurveyId") ?? (() => editorStore.remoteSurveyId);

// ── 从 Status 配置提取当前渲染参数 ─────────────────────────────────
const computedState = computed(() => ({
  title: getTextStatus(props.status.title),
  desc: getTextStatus(props.status.desc),
  position: getCurrentStatus(props.status.position),
  titleSize: getStringStatusByCurrentStatus(props.status.titleSize) as string,
  descSize: getStringStatusByCurrentStatus(props.status.descSize) as string,
  titleWeight: getCurrentStatus(props.status.titleWeight),
  descWeight: getCurrentStatus(props.status.descWeight),
  titleItalic: getCurrentStatus(props.status.titleItalic),
  descItalic: getCurrentStatus(props.status.descItalic),
  titleColor: getTextStatus(props.status.titleColor),
  descColor: getTextStatus(props.status.descColor),
  strokeColor: getTextStatus(props.status.strokeColor),
  strokeWidth: Number(getStringStatusByCurrentStatus(props.status.strokeWidth) ?? 3),
  // currentStatus=0 → "显示" → toolbar visible
  showToolbar: getCurrentStatus(props.status.showToolbar) === 0
}));

// ── 运行时状态（不持久化到 Status） ──────────────────────────────────
const canvasRef = ref<HTMLCanvasElement | null>(null);
const isDrawing = ref(false);
const isSigned = ref(false);
const uploading = ref(false);
const historyStack = ref<ImageData[]>([]);
let lastX = 0;
let lastY = 0;

const getCtx = () => canvasRef.value?.getContext("2d") ?? null;

// ── 高 DPI 初始化 ─────────────────────────────────────────────────
const initCanvas = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const container = canvas.parentElement;
  if (!container) return;
  const dpr = window.devicePixelRatio || 1;
  const displayW = container.clientWidth || 400;
  const displayH = 200;

  canvas.width = displayW * dpr;
  canvas.height = displayH * dpr;
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;

  const ctx = getCtx();
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
};

onMounted(() => {
  initCanvas();
});

// ── 历史快照（撤销用） ────────────────────────────────────────────
const saveHistory = () => {
  const canvas = canvasRef.value;
  const ctx = getCtx();
  if (!canvas || !ctx) return;
  const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
  historyStack.value.push(snap);
  // 最多保存 20 步，避免内存占用过大
  if (historyStack.value.length > 20) historyStack.value.shift();
};

// ── 鼠标事件 ──────────────────────────────────────────────────────
const getMousePos = (e: MouseEvent) => {
  const rect = canvasRef.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const startDraw = (e: MouseEvent) => {
  saveHistory();
  isDrawing.value = true;
  const { x, y } = getMousePos(e);
  lastX = x;
  lastY = y;
  const ctx = getCtx();
  if (!ctx) return;
  ctx.beginPath();
  ctx.moveTo(x, y);
};

const drawing = (e: MouseEvent) => {
  if (!isDrawing.value) return;
  const { x, y } = getMousePos(e);
  const ctx = getCtx();
  if (!ctx) return;
  ctx.strokeStyle = computedState.value.strokeColor;
  ctx.lineWidth = computedState.value.strokeWidth;
  // 二次贝塞尔曲线平滑笔画，避免折线感
  ctx.quadraticCurveTo(lastX, lastY, (x + lastX) / 2, (y + lastY) / 2);
  ctx.stroke();
  lastX = x;
  lastY = y;
};

/**
 * 结束绘制：将 canvas 转为 PNG blob 上传，答案存储 MinIO URL 而非 base64
 *
 * 上传失败或 surveyId 为空时，降级为存储 base64 dataURL
 */
const endDraw = async () => {
  if (!isDrawing.value) return;
  isDrawing.value = false;
  isSigned.value = true;

  const canvas = canvasRef.value;
  if (!canvas) return;

  // 若无 surveyId，降级为 base64 dataURL
  const sid = getSurveyId();
  if (!sid) {
    const dataUrl = canvas.toDataURL("image/png");
    emits("updateAnswer", dataUrl);
    return;
  }

  // 尝试 canvas → blob → 上传到 MinIO
  uploading.value = true;
  try {
    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, "image/png");
    });
    if (!blob) {
      // toBlob 失败，降级 dataURL
      emits("updateAnswer", canvas.toDataURL("image/png"));
      return;
    }

    const result = await uploadSignature(blob, sid);
    if (result.code === 0 && result.data?.file_url) {
      emits("updateAnswer", result.data.file_url);
    } else {
      ElMessage.error(result.msg || "签名上传失败");
      emits("updateAnswer", canvas.toDataURL("image/png"));
    }
  } catch {
    ElMessage.warning("签名上传失败，已使用本地存储");
    emits("updateAnswer", canvas.toDataURL("image/png"));
  } finally {
    uploading.value = false;
  }
};

// ── 触摸事件（移动端） ────────────────────────────────────────────
const getTouchPos = (e: TouchEvent) => {
  const touch = e.touches[0];
  if (!touch) return { x: 0, y: 0 };
  const rect = canvasRef.value!.getBoundingClientRect();
  return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
};

const startDrawTouch = (e: TouchEvent) => {
  saveHistory();
  isDrawing.value = true;
  const { x, y } = getTouchPos(e);
  lastX = x;
  lastY = y;
  const ctx = getCtx();
  if (!ctx) return;
  ctx.beginPath();
  ctx.moveTo(x, y);
};

const drawingTouch = (e: TouchEvent) => {
  if (!isDrawing.value) return;
  const { x, y } = getTouchPos(e);
  const ctx = getCtx();
  if (!ctx) return;
  ctx.strokeStyle = computedState.value.strokeColor;
  ctx.lineWidth = computedState.value.strokeWidth;
  ctx.quadraticCurveTo(lastX, lastY, (x + lastX) / 2, (y + lastY) / 2);
  ctx.stroke();
  lastX = x;
  lastY = y;
};

// ── 工具栏操作 ────────────────────────────────────────────────────
const undoDraw = () => {
  const canvas = canvasRef.value;
  const ctx = getCtx();
  if (!canvas || !ctx) return;
  const snap = historyStack.value.pop();
  if (!snap) return;
  ctx.putImageData(snap, 0, 0);
  // 回到初始状态时标记为未签名
  if (historyStack.value.length === 0) {
    isSigned.value = false;
    emits("updateAnswer", "");
  }
};

const clearCanvas = () => {
  const canvas = canvasRef.value;
  const ctx = getCtx();
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  historyStack.value = [];
  isSigned.value = false;
  emits("updateAnswer", "");
};
</script>

<style scoped lang="scss">
.signature-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}

.signature-canvas {
  display: block;
  width: 100%;
  height: 200px;
  border: 1px dashed var(--border-color, #dcdfe6);
  border-radius: 4px;
  background: #fff;
  cursor: crosshair;
  touch-action: none; /* 防止移动端滚动干扰绘制 */
}

.signature-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.signed-hint {
  font-size: 12px;
  color: var(--font-color-light, #909399);

  &.is-signed {
    color: var(--success-color, #67c23a);
  }

  &.is-uploading {
    color: var(--el-color-primary, #409eff);
  }
}
</style>
