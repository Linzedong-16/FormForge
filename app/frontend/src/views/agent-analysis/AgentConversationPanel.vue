<template>
  <div class="conversation-panel">
    <a-empty v-if="!session" description="请选择一份问卷并发起分析，或在左侧选择历史记录" class="empty-state" />

    <template v-else>
      <!-- 状态条：展示最新 status 文案 + loading 指示 -->
      <div class="status-bar">
        <a-spin v-if="session.status === 'streaming'" :size="16" class="status-spin" />
        <icon-check-circle-fill v-else-if="session.status === 'done'" class="status-icon status-icon-done" />
        <icon-close-circle-fill v-else-if="session.status === 'error'" class="status-icon status-icon-error" />
        <icon-info-circle-fill v-else class="status-icon status-icon-aborted" />
        <span class="status-text">{{ statusBarText }}</span>
        <a-button
          v-if="session.status === 'streaming'"
          type="text"
          status="danger"
          size="small"
          class="abort-btn"
          @click="emit('abort')"
        >
          取消
        </a-button>
      </div>

      <!-- 工具调用轨迹：默认收起，按 step 配对展示 tool_call / tool_result -->
      <a-collapse v-if="session.toolTrace.length > 0" class="tool-trace-collapse" :bordered="false">
        <a-collapse-item key="trace" :header="`工具调用轨迹（${session.toolTrace.length} 次）`">
          <div v-for="entry in session.toolTrace" :key="`${entry.step}-${entry.name}`" class="trace-entry">
            <div class="trace-entry-header">
              <icon-loading v-if="entry.status === 'calling'" spin class="trace-status-icon calling" />
              <icon-check-circle-fill v-else class="trace-status-icon done" />
              <span class="trace-step">#{{ entry.step }}</span>
              <span class="trace-name">{{ entry.name }}</span>
            </div>
            <pre class="trace-args">{{ formatJSON(entry.args) }}</pre>
            <pre v-if="entry.summary !== undefined" class="trace-summary">{{ formatSummary(entry.summary) }}</pre>
          </div>
        </a-collapse-item>
      </a-collapse>

      <!-- 降级警示：结论可能不完整，视觉上不可忽略 -->
      <a-alert v-if="session.degraded" type="warning" class="degraded-alert" title="分析未完全展开">
        受限于最大步数或超时限制，本次结论可能不完整，请谨慎参考。
      </a-alert>

      <!-- 结论正文：token 事件逐步拼接，streaming 中展示打字机光标 -->
      <div v-if="session.replyText" class="reply-text">
        {{ session.replyText }}<span v-if="session.status === 'streaming'" class="typing-cursor">▌</span>
      </div>

      <!-- 错误态：按错误分类展示文案 + 重试入口 -->
      <a-alert v-if="session.status === 'error'" type="error" class="state-alert" title="分析失败">
        <div class="error-content">
          <span>{{ session.errorMessage }}</span>
          <a-button type="text" size="small" status="danger" @click="emit('retry')">重试</a-button>
        </div>
      </a-alert>

      <!-- 已取消 -->
      <a-alert v-if="session.status === 'aborted'" type="info" class="state-alert" title="已取消本次分析" />

      <!-- 完成摘要 -->
      <div v-if="session.status === 'done'" class="done-summary">
        共执行 {{ session.steps }} 步、调用 {{ session.toolTrace.length }} 次工具
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Agent 问卷分析 — 会话详情面板
 *
 * 纯展示组件：接收单条会话记录，渲染状态条/工具轨迹/结论正文/降级与错误提示。
 * 中止与重试由父组件处理（此处仅转发事件），避免面板直接依赖 store。
 */
import { computed } from "vue";
import type { AgentAnalysisSession } from "@/store/modules/agentAnalysis";

const props = defineProps<{
  session: AgentAnalysisSession | null;
}>();

const emit = defineEmits<{
  abort: [];
  retry: [];
}>();

/** 状态条文案：streaming 展示最新 status 事件文案，其余展示终态提示 */
const statusBarText = computed(() => {
  const session = props.session;
  if (!session) return "";
  if (session.status === "streaming") return session.statusText || "分析中...";
  if (session.status === "done") return "分析完成";
  if (session.status === "aborted") return "已取消";
  return "分析失败";
});

/** 工具调用参数格式化（JSON 美化，避免超长单行） */
function formatJSON(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 工具执行结果摘要格式化：字符串直接展示，对象美化为 JSON */
function formatSummary(summary: string | Record<string, unknown>): string {
  if (typeof summary === "string") return summary;
  return formatJSON(summary);
}
</script>

<style scoped>
.conversation-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 320px;
}

.empty-state {
  margin: auto;
}

/* ── 状态条 ────────────────────────────────────────────── */

.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-fill-1);
  border-radius: var(--radius-md);
}

.status-spin {
  flex-shrink: 0;
}

.status-icon {
  flex-shrink: 0;
  font-size: 16px;
}

.status-icon-done {
  color: rgb(var(--green-6));
}

.status-icon-error {
  color: rgb(var(--red-6));
}

.status-icon-aborted {
  color: var(--color-text-3);
}

.status-text {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-2);
}

.abort-btn {
  flex-shrink: 0;
}

/* ── 工具调用轨迹 ──────────────────────────────────────── */

.tool-trace-collapse {
  border-radius: var(--radius-md);
  overflow: hidden;
}

.trace-entry {
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border-1);
}

.trace-entry:last-child {
  border-bottom: none;
}

.trace-entry-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.trace-status-icon {
  font-size: 14px;
}

.trace-status-icon.calling {
  color: rgb(var(--arcoblue-6));
}

.trace-status-icon.done {
  color: rgb(var(--green-6));
}

.trace-step {
  font-size: 12px;
  color: var(--color-text-3);
}

.trace-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-1);
}

.trace-args,
.trace-summary {
  margin: 4px 0 0;
  padding: 8px 10px;
  font-size: 12px;
  font-family: "Consolas", "Monaco", monospace;
  color: var(--color-text-2);
  background: var(--color-fill-2);
  border-radius: var(--radius-sm);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
}

/* ── 降级警示 / 错误 / 取消 ────────────────────────────── */

.degraded-alert,
.state-alert {
  border-radius: var(--radius-md);
}

.error-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* ── 结论正文 ──────────────────────────────────────────── */

.reply-text {
  padding: 14px 16px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-1);
  background: var(--color-bg-2);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  white-space: pre-wrap;
  word-break: break-word;
}

.typing-cursor {
  display: inline-block;
  animation: blink 1s steps(2, start) infinite;
  color: rgb(var(--primary-5));
}

@keyframes blink {
  to {
    opacity: 0;
  }
}

/* ── 完成摘要 ──────────────────────────────────────────── */

.done-summary {
  font-size: 12px;
  color: var(--color-text-3);
  text-align: right;
}
</style>
