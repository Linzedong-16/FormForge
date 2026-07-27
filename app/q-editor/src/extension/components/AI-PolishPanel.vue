<template>
  <div class="ai-polish-panel">
    <!-- ── 空闲状态：输入润色指令 ──────────────────────────── -->
    <template v-if="isIdle">
      <div class="polish-input-area">
        <label class="polish-label">{{ t("editor.aiPolishLabel") }}</label>
        <el-input
          v-model="instructions"
          type="textarea"
          :rows="3"
          maxlength="2000"
          show-word-limit
          :placeholder="t('editor.aiPolishPlaceholder')"
        />
      </div>

      <!-- 润色维度选择 -->
      <div class="polish-aspects">
        <span class="aspects-label">{{ t("editor.aiPolishAspects") }}</span>
        <el-checkbox-group v-model="aspects" size="small">
          <el-checkbox v-for="a in aspectOptions" :key="a.value" :value="a.value" :border="true">{{
            a.label
          }}</el-checkbox>
        </el-checkbox-group>
      </div>

      <div class="polish-actions">
        <el-button type="primary" :disabled="!instructions.trim()" @click="handlePolish">
          {{ t("editor.aiPolishStart") }}
        </el-button>
      </div>
    </template>

    <!-- ── 润色中：流式文本预览 ──────────────────────────────── -->
    <template v-if="isPolishing">
      <div class="polish-stream-box">
        <div class="stream-header">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>{{ t("editor.aiPolishing") }}</span>
        </div>
        <div class="stream-text">
          {{ streamText }}
          <span class="cursor-blink">|</span>
        </div>
      </div>
      <div class="polish-actions">
        <el-button @click="cancel">{{ t("editor.aiCancelBtn") }}</el-button>
      </div>
    </template>

    <!-- ── 完成状态：结果展示 ─────────────────────────────────── -->
    <template v-if="isDone && result">
      <div class="polish-result">
        <div class="result-header">
          <el-icon color="#67c23a"><CircleCheckFilled /></el-icon>
          <span class="result-title">{{ t("editor.aiPolishDone") }}</span>
        </div>

        <!-- 可滚动内容区 -->
        <div class="result-scroll">
          <!-- 变更清单 -->
          <div v-if="result.changes.length > 0" class="changes-section">
            <p class="section-label">{{ t("editor.aiPolishChanges") }}（{{ result.changes.length }}）</p>
            <ul class="changes-list">
              <li v-for="(change, i) in result.changes" :key="i">{{ change }}</li>
            </ul>
          </div>

          <!-- 警告 -->
          <div v-if="result.warnings.length > 0" class="warnings-section">
            <el-alert :title="result.warnings.join('；')" type="warning" :closable="false" show-icon />
          </div>
        </div>
      </div>

      <!-- 操作按钮固定在底部 -->
      <div class="polish-actions">
        <el-button type="primary" @click="handleApply">
          {{ t("editor.aiPolishApply") }}
        </el-button>
        <el-button @click="reset">{{ t("editor.aiRetryBtn") }}</el-button>
      </div>
    </template>

    <!-- ── 错误状态 ─────────────────────────────────────────── -->
    <template v-if="isError">
      <el-result icon="error" :title="t('editor.aiPolishFailed')" :sub-title="errorMessage">
        <template #extra>
          <el-button type="primary" @click="reset">{{ t("editor.aiRetryBtn") }}</el-button>
        </template>
      </el-result>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ElMessage, ElMessageBox } from "element-plus";
import { Loading, CircleCheckFilled } from "@element-plus/icons-vue";
import { useAIPolish } from "@/composables/useAIPolish";
import type { AIPolishAspect } from "monorepo-code-common";
import { AI_POLISH_ASPECT_LABELS } from "monorepo-code-common";

const { t } = useI18n();

const {
  instructions,
  aspects,
  streamText,
  result,
  errorMessage,
  isIdle,
  isPolishing,
  isDone,
  isError,
  polish,
  cancel,
  applyToEditor,
  reset
} = useAIPolish();

// 润色维度选项（从公共常量生成）
const aspectOptions = Object.entries(AI_POLISH_ASPECT_LABELS).map(([value, label]) => ({
  value: value as AIPolishAspect,
  label
}));

// ── 事件处理 ────────────────────────────────────────────────

function handlePolish() {
  polish();
}

async function handleApply() {
  try {
    await ElMessageBox.confirm(t("editor.aiPolishApplyConfirm"), t("editor.aiPolishApplyTitle"), {
      confirmButtonText: t("editor.confirm"),
      cancelButtonText: t("editor.cancel"),
      type: "warning"
    });
  } catch {
    return; // 用户取消
  }

  const warnings = applyToEditor();
  if (warnings.length > 0) {
    ElMessage.warning(warnings.join("；"));
  }
  ElMessage.success(t("editor.aiPolishApplySuccess"));
}
</script>

<style scoped>
.ai-polish-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 0;
}

/* ── 输入区 ─────────────────────────── */
.polish-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--font-color);
}

.polish-aspects {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.aspects-label {
  font-size: 12px;
  color: var(--font-color-lighter);
}

.polish-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* ── 流式文本预览 ───────────────────── */
.polish-stream-box {
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  padding: 12px;
  min-height: 80px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--background-color);
}

.stream-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--font-color-lighter);
  margin-bottom: 8px;
}

.stream-text {
  font-size: 13px;
  color: var(--font-color);
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: var(--primary-color);
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* ── 结果展示（固定高度 + 滚动） ──────── */
.polish-result {
  display: flex;
  flex-direction: column;
  max-height: 260px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #67c23a;
  flex-shrink: 0;
}

.result-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0; /* flex 子元素滚动的关键 */
}

.changes-section {
  margin-top: 2px;
}

.section-label {
  font-size: 12px;
  color: var(--font-color-lighter);
  margin-bottom: 6px;
}

.changes-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--font-color);
  line-height: 1.7;
}

.warnings-section {
  margin-top: 4px;
}
</style>
