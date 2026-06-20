<template>
  <div class="playground">
    <h1>Components Playground</h1>
    <p class="subtitle">monorepo-code-components 组件开发预览</p>

    <section class="demo-section">
      <h2>CropperBox — 头像裁剪</h2>
      <p class="desc">拖拽移动、滚轮缩放、双指操作。选择一个图片文件开始测试。</p>

      <div class="demo-row">
        <div class="cropper-wrapper">
          <CropperBox
            v-if="imageUrl"
            ref="cropperRef"
            :image-url="imageUrl"
            :crop-size="200"
            :output-size="200"
            output-type="png"
            @load="handleLoad"
          />
          <div v-else class="placeholder">请选择一个图片文件</div>
        </div>

        <div class="controls">
          <input type="file" accept="image/*" @change="handleFileChange" />

          <div v-if="imageUrl" class="btn-group">
            <el-button @click="handleZoomIn">
              <el-icon><ZoomIn /></el-icon> 放大
            </el-button>
            <el-button @click="handleZoomOut">
              <el-icon><ZoomOut /></el-icon> 缩小
            </el-button>
            <el-button @click="handleRotateLeft">
              <el-icon><RefreshLeft /></el-icon> 左转
            </el-button>
            <el-button @click="handleRotateRight">
              <el-icon><RefreshRight /></el-icon> 右转
            </el-button>
          </div>

          <div v-if="imageUrl" class="btn-group">
            <el-button type="success" @click="handleGetPreview"> 获取预览 </el-button>
            <el-button type="primary" @click="handleGetFile"> 导出 Blob </el-button>
          </div>

          <div v-if="cropState" class="state-info">
            <p>偏移: ({{ cropState.x.toFixed(0) }}, {{ cropState.y.toFixed(0) }})</p>
            <p>缩放: {{ cropState.scale.toFixed(2) }}x</p>
            <p>旋转: {{ cropState.rotation }}°</p>
          </div>
        </div>
      </div>

      <img v-if="previewUrl" :src="previewUrl" class="preview-img" alt="crop preview" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage, ElButton } from "element-plus";
import { ZoomIn, ZoomOut, RefreshLeft, RefreshRight } from "@element-plus/icons-vue";
import { CropperBox, type CropState } from "../src";

const cropperRef = ref<InstanceType<typeof CropperBox> | null>(null);
const imageUrl = ref("");
const previewUrl = ref("");
const cropState = ref<CropState | null>(null);

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
  cropState.value = null;

  imageUrl.value = URL.createObjectURL(file);
}

function handleLoad(status: "success" | "error") {
  if (status === "error") {
    ElMessage.error("图片加载失败");
  }
}

function handleZoomIn() {
  const currentScale = cropperRef.value?.getScale() ?? 1;
  cropperRef.value?.setScale(currentScale + 0.1);
}

function handleZoomOut() {
  const currentScale = cropperRef.value?.getScale() ?? 1;
  cropperRef.value?.setScale(currentScale - 0.1);
}

function handleRotateLeft() {
  cropperRef.value?.rotateLeft();
}

function handleRotateRight() {
  cropperRef.value?.rotateRight();
}

async function handleGetPreview() {
  try {
    previewUrl.value = await cropperRef.value!.getCropDataUrl();
    ElMessage.success("预览已生成");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    ElMessage.error("预览生成失败");
  }
}

async function handleGetFile() {
  try {
    const blob = await cropperRef.value!.getCropBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cropped-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success(`导出成功 (${(blob.size / 1024).toFixed(1)} KB)`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    ElMessage.error("导出失败");
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
}
</style>

<style scoped>
.playground {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 24px;
}

h1 {
  font-size: 24px;
  margin-bottom: 4px;
}

.subtitle {
  color: #999;
  margin-bottom: 32px;
}

.demo-section {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  border: 1px solid #e5e5e5;
}

.demo-section h2 {
  font-size: 18px;
  margin-bottom: 8px;
}

.desc {
  color: #666;
  font-size: 14px;
  margin-bottom: 20px;
}

.demo-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.cropper-wrapper {
  width: 340px;
  height: 340px;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
  font-size: 14px;
}

.controls {
  flex: 1;
  min-width: 250px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.state-info {
  font-size: 13px;
  color: #666;
  background: #f9f9f9;
  border-radius: 6px;
  padding: 12px;
}

.state-info p {
  margin-bottom: 4px;
}

.preview-img {
  margin-top: 20px;
  border-radius: 50%;
  border: 2px solid #e5e5e5;
}
</style>
