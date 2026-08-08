<template>
  <div class="agent-analysis-page">
    <!-- 顶部标题 -->
    <div class="page-header">
      <div class="title-area">
        <h2 class="page-title">AI 问卷分析</h2>
        <p class="page-desc">基于 Agent 自主 Function Calling 循环，对问卷答卷数据进行深度分析</p>
      </div>
    </div>

    <!-- 发起分析区 -->
    <a-card :bordered="false" class="launch-card">
      <div class="launch-row">
        <a-select
          v-model="surveyId"
          placeholder="请选择要分析的问卷"
          allow-search
          class="survey-select"
          :disabled="store.isStreaming"
        >
          <a-option v-for="s in publishedSurveys" :key="s.id" :value="s.id" :label="s.title">
            {{ s.title }}
          </a-option>
        </a-select>
        <a-input
          v-model="focus"
          placeholder="可选：本次分析的侧重方向，例如「重点关注文本题的情感倾向」"
          :max-length="200"
          show-word-limit
          class="focus-input"
          :disabled="store.isStreaming"
        />
        <a-button
          v-if="!store.isStreaming"
          type="primary"
          :disabled="!surveyId"
          class="launch-btn"
          @click="handleStart"
        >
          <template #icon><icon-robot /></template>
          开始分析
        </a-button>
        <a-button v-else status="danger" class="launch-btn" @click="store.abortCurrent()">
          <template #icon><icon-close /></template>
          取消分析
        </a-button>
      </div>
    </a-card>

    <!-- 主体：历史列表 + 会话详情 -->
    <div class="main-layout">
      <!-- 历史会话列表 -->
      <a-card :bordered="false" class="history-card">
        <template #title>
          <div class="history-title-row">
            <span>历史记录</span>
            <a-button
              type="text"
              size="mini"
              :disabled="store.sessions.length === 0 || store.isStreaming"
              @click="handleClearHistory"
            >
              清空
            </a-button>
          </div>
        </template>

        <a-empty v-if="store.sessions.length === 0" description="暂无分析记录" />

        <div v-else class="history-list">
          <div
            v-for="session in store.sessions"
            :key="session.id"
            class="history-item"
            :class="{ active: session.id === selectedSessionId }"
            @click="selectedSessionId = session.id"
          >
            <div class="history-item-main">
              <a-tag :color="statusTagColor(session.status)" size="small">{{ statusTagLabel(session.status) }}</a-tag>
              <span class="history-item-title">{{ surveyTitleOf(session.survey_id) }}</span>
            </div>
            <div class="history-item-meta">
              <span>{{ formatTime(session.createdAt) }}</span>
              <a-button
                type="text"
                size="mini"
                status="danger"
                :disabled="session.status === 'streaming'"
                @click.stop="store.removeSession(session.id)"
              >
                <icon-delete />
              </a-button>
            </div>
          </div>
        </div>
      </a-card>

      <!-- 会话详情面板 -->
      <a-card :bordered="false" class="detail-card">
        <AgentConversationPanel :session="selectedSession" @abort="store.abortCurrent()" @retry="handleRetry" />
      </a-card>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Agent 问卷分析 — 主视图
 *
 * 布局：顶部问卷选择 + 分析侧重点输入 + 开始/取消按钮；
 *       主体左侧历史会话列表，右侧当前选中会话的详情面板（AgentConversationPanel）。
 *
 * 设计取舍：
 *   - 不透传 session_id，每次分析都是独立会话（详见 README.md）
 *   - 同一时间只允许一个进行中的分析，由 store.startAnalysis 内部拒绝
 */
import { ref, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { Message } from "@arco-design/web-vue";
import { getSurveyList } from "@/api/modules/survey";
import type { SurveyListItem } from "@common/survey/survey.interface";
import { useAgentAnalysisStore, type AgentAnalysisStatus } from "@/store/modules/agentAnalysis";
import AgentConversationPanel from "./AgentConversationPanel.vue";

const route = useRoute();
const store = useAgentAnalysisStore();

// ─── 问卷选择 ──────────────────────────────────────────────────

const publishedSurveys = ref<SurveyListItem[]>([]);
const surveyId = ref<string>("");
const focus = ref<string>("");

async function loadSurveys() {
  try {
    const res = await getSurveyList({ page_size: 50, status: 1 });
    if (res.code === 0 && res.data) {
      publishedSurveys.value = res.data.surveys;
    }
  } catch {
    Message.error("加载问卷列表失败");
  }
}

function surveyTitleOf(id: string): string {
  return publishedSurveys.value.find(s => s.id === id)?.title ?? id;
}

// ─── 会话选择 ──────────────────────────────────────────────────

const selectedSessionId = ref<string | null>(null);
const selectedSession = computed(() => store.sessions.find(s => s.id === selectedSessionId.value) ?? null);

// 新分析开始后自动选中该会话，便于用户立即看到流式过程
watch(
  () => store.activeSessionId,
  activeId => {
    if (activeId) selectedSessionId.value = activeId;
  }
);

// ─── 发起分析 ──────────────────────────────────────────────────

function handleStart() {
  if (!surveyId.value) {
    Message.warning("请先选择要分析的问卷");
    return;
  }
  const started = store.startAnalysis({ survey_id: surveyId.value, focus: focus.value });
  if (!started) {
    Message.warning("已有一个分析正在进行，请先取消或等待完成");
  }
}

/** 重试：沿用当前选中会话的问卷/侧重点，重新发起一次新分析 */
function handleRetry() {
  const session = selectedSession.value;
  if (!session) return;
  surveyId.value = session.survey_id;
  focus.value = session.focus;
  handleStart();
}

function handleClearHistory() {
  store.clearHistory();
  selectedSessionId.value = null;
}

// ─── 状态标签展示 ──────────────────────────────────────────────

function statusTagColor(status: AgentAnalysisStatus): string {
  if (status === "streaming") return "arcoblue";
  if (status === "done") return "green";
  if (status === "error") return "red";
  return "gray";
}

function statusTagLabel(status: AgentAnalysisStatus): string {
  if (status === "streaming") return "进行中";
  if (status === "done") return "已完成";
  if (status === "error") return "失败";
  return "已取消";
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── 初始化 ──────────────────────────────────────────────────

onMounted(() => {
  loadSurveys();
  // 从答卷统计详情页跳转而来时，预填问卷 ID（不自动发起请求）
  const queryId = route.query.survey_id;
  if (typeof queryId === "string" && queryId) {
    surveyId.value = queryId;
  }
  // 默认选中最近一条历史记录
  const latest = store.sessions[0];
  if (latest) {
    selectedSessionId.value = latest.id;
  }
});
</script>

<style scoped>
.agent-analysis-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-1);
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-3);
}

/* ── 发起分析区 ────────────────────────────────────────── */

.launch-card {
  border-radius: var(--radius-md);
}

.launch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.survey-select {
  width: 260px;
  flex-shrink: 0;
}

.focus-input {
  flex: 1;
  min-width: 240px;
}

.launch-btn {
  flex-shrink: 0;
}

/* ── 主体布局：响应式，窄屏堆叠 ──────────────────────────── */

.main-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.history-card {
  width: 300px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
}

.detail-card {
  flex: 1;
  min-width: 320px;
  border-radius: var(--radius-md);
}

.history-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 560px;
  overflow-y: auto;
}

.history-item {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s ease;
}

.history-item:hover {
  background: var(--color-fill-1);
}

.history-item.active {
  background: var(--color-fill-2);
  box-shadow: var(--shadow-xs);
}

.history-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.history-item-title {
  font-size: 13px;
  color: var(--color-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-text-3);
}

/* ── 窄屏适配 ──────────────────────────────────────────── */

@media (max-width: 900px) {
  .history-card {
    width: 100%;
  }

  .survey-select {
    width: 100%;
  }
}
</style>
