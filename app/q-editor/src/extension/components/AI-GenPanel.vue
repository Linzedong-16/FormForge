<script setup lang="ts">
/**
 * AI-GenPanel — AI 一键生成问卷面板
 *
 * 功能：
 *   1. 参数配置：需求描述（自然语言）、题目数量、语言选择
 *   2. SSE 流式生成：打字机效果 + 逐组件预览
 *   3. 生成结果：预览、应用到编辑器、重新生成
 *   4. 异常处理：网络中断、超时、服务异常 → 友好提示
 *   5. 生成历史：最近 5 次记录，可快速恢复
 */

import { ref, computed } from "vue";
import { useAIGenerate } from "@/composables/useAIGenerate";
import { useEditorStore } from "@/stores/useEditor";
import { useI18n } from "vue-i18n";
import { ElMessage, ElMessageBox } from "element-plus";

const { t } = useI18n();
const editorStore = useEditorStore();

// ─── AI 生成状态 ────────────────────────────────────────────
const {
  prompt,
  count,
  language,
  streamText,
  components,
  errorMessage,
  result,
  history,
  isIdle,
  isGenerating,
  isDone,
  isError,
  componentCount,
  generate,
  cancel,
  reset,
  restoreHistory,
  aiComponentsToStatus
} = useAIGenerate();

// ─── 面板控制 ────────────────────────────────────────────────
const visible = ref(false);

defineExpose({ open: () => (visible.value = true), close: () => (visible.value = false) });

/** 关闭面板 */
function closePanel() {
  if (isGenerating.value) {
    cancel();
  }
  visible.value = false;
}

// ─── 业务操作 ────────────────────────────────────────────────

/** 开始生成 */
function handleGenerate() {
  const error = validateInput();
  if (error) {
    ElMessage.warning(t(`editor.${error}`));
    return;
  }
  generate();
}

/**
 * 输入校验（返回 i18n key 或 null）
 */
function validateInput(): string | null {
  const trimmed = prompt.value.trim();
  if (!trimmed) return "aiEmptyPrompt";
  if (trimmed.length < 5) return "aiPromptTooShort";
  if (trimmed.length > 2000) return "aiPromptTooLong";
  return null;
}

/** 应用到编辑器 */
async function handleApply() {
  if (!result.value || result.value.components.length === 0) {
    ElMessage.warning(t("editor.aiNoComponents"));
    return;
  }

  // 弹出模式选择对话框
  let mode: "overwrite" | "append";
  try {
    await ElMessageBox.confirm(t("editor.aiApplyModeDesc"), t("editor.aiApplyModeTitle"), {
      confirmButtonText: t("editor.aiApplyModeOverwrite"),
      cancelButtonText: t("editor.aiApplyModeAppend"),
      distinguishCancelAndClose: true,
      type: "info"
    });
    mode = "overwrite";
  } catch (action: unknown) {
    if (action === "cancel") {
      mode = "append";
    } else {
      return; // 用户关闭对话框
    }
  }

  // 覆盖模式：需额外确认未保存内容
  if (mode === "overwrite") {
    if (editorStore.dirty) {
      try {
        await ElMessageBox.confirm(t("editor.aiApplyConfirm"), t("editor.confirmTitle"), {
          confirmButtonText: t("editor.confirm"),
          cancelButtonText: t("editor.cancel"),
          type: "warning"
        });
      } catch {
        return; // 用户取消
      }
    }
    applyComponents(true);
  } else {
    applyComponents(false);
  }
}

/**
 * 将 AI 生成结果应用到编辑器
 * @param overwrite true=覆盖（先清空），false=追加
 */
function applyComponents(overwrite: boolean) {
  // AIComponent[] → Status[] 转换
  const rawComponents =
    result.value!._rawComponents ??
    result.value!.components.map(c => ({
      type: c.type,
      config: {} as Record<string, unknown>
    }));

  const { statuses, warnings } = aiComponentsToStatus(rawComponents as Parameters<typeof aiComponentsToStatus>[0]);

  // 显示转换警告
  if (warnings.length > 0) {
    ElMessage.warning({
      message: warnings.join("；"),
      duration: 5000
    });
  }

  if (statuses.length === 0) {
    ElMessage.warning(t("editor.aiNoComponents"));
    return;
  }

  // 应用到编辑器
  if (overwrite) {
    editorStore.resetComs();
  }
  for (const status of statuses) {
    editorStore.addCom(status);
  }

  ElMessage.success(overwrite ? t("editor.aiApplyOverwriteSuccess") : t("editor.aiApplyAppendSuccess"));
  visible.value = false;
}

/** 预览生成结果（在新标签页打开预览） */
function handlePreview() {
  // 先应用到编辑器再跳转预览
  // 但预览不保存，所以只做临时预览
  ElMessage.info("预览功能开发中");
}

// ─── 语言选项 ────────────────────────────────────────────────
const languageOptions = [
  { value: "zh-CN", label: "中文（简体）" },
  { value: "en-US", label: "English" },
  { value: "ja-JP", label: "日本語" }
];

// ─── 反馈消息映射 ────────────────────────────────────────────
const resolvedError = computed(() => {
  if (!errorMessage.value) return "";
  // 如果 errorMessage 已经是 i18n key 格式
  if (errorMessage.value.startsWith("ai")) {
    return t(`editor.${errorMessage.value}`);
  }
  return errorMessage.value;
});
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="t('editor.aiPanelTitle')"
    direction="rtl"
    size="480px"
    :close-on-click-modal="false"
    @close="closePanel"
  >
    <div class="ai-gen-panel">
      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  Phase: idle — 参数配置表单                           -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <div v-if="isIdle" class="ai-gen-form">
        <p class="ai-gen-desc">{{ t("editor.aiPanelDesc") }}</p>

        <!-- 需求描述 -->
        <div class="form-item">
          <label class="form-label">{{ t("editor.aiPromptLabel") }}</label>
          <el-input
            v-model="prompt"
            type="textarea"
            :rows="6"
            :placeholder="t('editor.aiPromptPlaceholder')"
            maxlength="2000"
            show-word-limit
          />
        </div>

        <!-- 题目数量 -->
        <div class="form-item">
          <label class="form-label"
            >{{ t("editor.aiCountLabel") }}：<strong>{{ count }}</strong></label
          >
          <el-slider v-model="count" :min="5" :max="20" :step="1" show-stops />
        </div>

        <!-- 语言 -->
        <div class="form-item">
          <label class="form-label">{{ t("editor.aiLanguageLabel") }}</label>
          <el-select v-model="language" style="width: 100%">
            <el-option v-for="opt in languageOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </div>

        <!-- 生成按钮 -->
        <el-button type="primary" size="large" style="width: 100%; margin-top: 16px" @click="handleGenerate">
          {{ t("editor.aiGenerateBtn") }}
        </el-button>
      </div>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  Phase: generating — 流式生成进度                      -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <div v-if="isGenerating" class="ai-gen-progress">
        <!-- 状态指示 -->
        <div class="progress-header">
          <el-icon class="is-loading"><i class="el-icon-loading" /></el-icon>
          <span>{{ t("editor.aiGenerating") }}</span>
        </div>

        <!-- 流式文本预览 -->
        <div class="stream-preview">
          <div class="stream-label">{{ t("editor.aiStreamPreview") }}</div>
          <div class="stream-content">
            {{ streamText || "..." }}
            <span class="cursor-blink">|</span>
          </div>
        </div>

        <!-- 已生成组件列表 -->
        <div class="component-list">
          <div class="component-list-header">
            <span>{{ t("editor.aiGeneratedComponents") }}（{{ componentCount }}）</span>
          </div>
          <TransitionGroup name="comp-list" tag="div" class="comp-items">
            <div v-for="comp in components" :key="comp.index" class="comp-item">
              <span class="comp-index">{{ comp.index + 1 }}</span>
              <span class="comp-type">{{ comp.type }}</span>
              <span class="comp-title">{{ comp.title }}</span>
            </div>
          </TransitionGroup>
          <div v-if="components.length === 0" class="comp-empty">等待 AI 输出...</div>
        </div>

        <!-- 取消按钮 -->
        <el-button type="default" size="large" style="width: 100%; margin-top: 16px" @click="cancel">
          {{ t("editor.aiCancelBtn") }}
        </el-button>
      </div>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  Phase: done — 生成完成                                -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <div v-if="isDone && result" class="ai-gen-result">
        <!-- 成功提示 -->
        <div class="result-header">
          <el-icon color="#67c23a"><i class="el-icon-success" /></el-icon>
          <span>已生成 {{ result.components.length }} 个有效组件</span>
        </div>

        <!-- 问卷概览 -->
        <div class="result-overview">
          <div class="overview-title">{{ result.title || "未命名问卷" }}</div>
          <div v-if="result.description" class="overview-desc">{{ result.description }}</div>
        </div>

        <!-- 组件列表 -->
        <div class="component-list">
          <div class="component-list-header">
            <span>{{ t("editor.aiGeneratedComponents") }}（{{ result.components.length }}）</span>
          </div>
          <div class="comp-items">
            <div v-for="comp in result.components" :key="comp.index" class="comp-item">
              <span class="comp-index">{{ comp.index + 1 }}</span>
              <span class="comp-type">{{ comp.type }}</span>
              <span class="comp-title">{{ comp.title || "(未命名)" }}</span>
            </div>
          </div>
        </div>

        <!-- 警告信息 -->
        <div v-if="result.warnings.length > 0" class="result-warnings">
          <div class="warn-title">{{ t("editor.aiWarningTitle") }}</div>
          <div v-for="(w, i) in result.warnings" :key="i" class="warn-item">{{ w }}</div>
        </div>

        <!-- 操作按钮 -->
        <div class="result-actions">
          <el-button size="large" @click="handlePreview">
            {{ t("editor.aiPreviewBtn") }}
          </el-button>
          <el-button type="primary" size="large" @click="handleApply">
            {{ t("editor.aiApplyBtn") }}
          </el-button>
        </div>
        <el-button type="default" size="large" style="width: 100%; margin-top: 8px" @click="reset">
          {{ t("editor.aiRetryBtn") }}
        </el-button>
      </div>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  Phase: error — 错误提示                               -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <div v-if="isError" class="ai-gen-error">
        <el-result icon="error" :title="t('editor.aiServiceError')" :sub-title="resolvedError">
          <template #extra>
            <el-button type="primary" @click="reset">{{ t("editor.aiRetryBtn") }}</el-button>
          </template>
        </el-result>
      </div>

      <!-- ═══════════════════════════════════════════════════════ -->
      <!--  生成历史                                              -->
      <!-- ═══════════════════════════════════════════════════════ -->
      <div v-if="history.length > 0 && isIdle" class="ai-gen-history">
        <div class="history-title">{{ t("editor.aiHistoryTitle") }}</div>
        <div v-for="(entry, i) in history" :key="i" class="history-item" @click="restoreHistory(entry)">
          <div class="history-text">{{ entry.prompt.slice(0, 40) }}{{ entry.prompt.length > 40 ? "..." : "" }}</div>
          <div class="history-meta">{{ entry.result.components.length }} 个组件</div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped lang="scss">
.ai-gen-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

// ─── 表单 ─────────────────────────────────────────────────
.ai-gen-form {
  flex: 1;
  overflow-y: auto;
}

.ai-gen-desc {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-bottom: 20px;
  line-height: 1.6;
}

.form-item {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

// ─── 进度 ─────────────────────────────────────────────────
.ai-gen-progress {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--el-color-primary);
}

.stream-preview {
  margin-bottom: 16px;
}

.stream-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.stream-content {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.8;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.cursor-blink {
  animation: blink 1s infinite;
  color: var(--el-color-primary);
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

// ─── 组件列表 ─────────────────────────────────────────────
.component-list {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 12px;
}

.component-list-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.comp-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comp-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  font-size: 13px;
  transition: background 0.2s;

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.comp-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.comp-type {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  padding: 2px 6px;
  background: var(--el-fill-color);
  border-radius: 3px;
  flex-shrink: 0;
}

.comp-title {
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comp-empty {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  text-align: center;
  padding: 20px 0;
}

// ─── TransitionGroup 动画 ─────────────────────────────────
.comp-list-enter-active {
  transition: all 0.3s ease;
}
.comp-list-leave-active {
  transition: all 0.2s ease;
}
.comp-list-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.comp-list-leave-to {
  opacity: 0;
}

// ─── 结果 ─────────────────────────────────────────────────
.ai-gen-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 15px;
  font-weight: 500;
  color: #67c23a;
}

.result-overview {
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  margin-bottom: 16px;
}

.overview-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}

.overview-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.result-warnings {
  margin-top: 12px;
  padding: 12px;
  background: var(--el-color-warning-light-9);
  border-radius: 6px;
}

.warn-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-color-warning);
  margin-bottom: 6px;
}

.warn-item {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  padding: 2px 0;

  &::before {
    content: "• ";
    color: var(--el-color-warning);
  }
}

.result-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;

  .el-button {
    flex: 1;
  }
}

// ─── 错误 ─────────────────────────────────────────────────
.ai-gen-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

// ─── 历史 ─────────────────────────────────────────────────
.ai-gen-history {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-light);
}

.history-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 10px;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.history-text {
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.history-meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  margin-left: 12px;
}
</style>
