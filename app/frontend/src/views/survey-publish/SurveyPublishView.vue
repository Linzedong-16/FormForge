<template>
  <div class="survey-publish-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">问卷发布</h2>
      <p class="page-desc">管理问卷发布状态，支持上线、下线、预览及发布历史查看</p>
    </div>

    <!-- 操作栏 -->
    <div class="filter-bar">
      <a-space :size="16">
        <span class="filter-label">发布状态：</span>
        <a-select
          v-model="filterStatus"
          placeholder="全部状态"
          allow-clear
          style="width: 140px"
          @change="handleFilterChange"
        >
          <a-option value="draft">草稿</a-option>
          <a-option value="published">已发布</a-option>
          <a-option value="offline">已下线</a-option>
        </a-select>
        <a-divider direction="vertical" />
        <a-input-search
          v-model="searchKeyword"
          placeholder="搜索问卷标题"
          style="width: 200px"
          allow-clear
          @search="handleSearch"
          @clear="handleSearch"
        />
      </a-space>
      <a-space>
        <a-button type="primary" @click="handleCreate">
          <template #icon><icon-plus /></template>
          新建问卷
        </a-button>
      </a-space>
    </div>

    <!-- 问卷列表表格 -->
    <a-table
      :data="surveyList"
      :loading="loading"
      :pagination="{
        current: currentPage,
        pageSize: pageSize,
        total: total,
        showTotal: true,
        showPageSize: true,
        pageSizeOptions: [10, 20, 50]
      }"
      :stripe="true"
      :bordered="{ wrapper: true, cell: true }"
      column-resizable
      row-key="id"
      @page-change="handlePageChange"
      @page-size-change="
        (size: number) => {
          pageSize = size;
          loadSurveyList();
        }
      "
    >
      <template #columns>
        <a-table-column title="问卷 ID" data-index="id" :width="80" align="center" />
        <a-table-column title="问卷标题" data-index="title" :ellipsis="true" :width="240">
          <template #cell="{ record }">
            <span class="title-link" @click="handlePreview(record)">{{ record.title }}</span>
          </template>
        </a-table-column>
        <a-table-column title="创建者 ID" data-index="creator" :width="100" align="center" />
        <a-table-column title="发布状态" :width="90" align="center">
          <template #cell="{ record }">
            <a-tag :color="statusColor(record.status)" size="small">{{ statusLabel(record.status) }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="题目数" data-index="questionCount" :width="70" align="center" />
        <a-table-column title="答卷数" data-index="responseCount" :width="80" align="center">
          <template #cell="{ record }">
            <span v-if="record.status !== 'draft'">{{ record.responseCount }}</span>
            <span v-else class="text-muted">—</span>
          </template>
        </a-table-column>
        <a-table-column title="创建时间" :width="160" align="center">
          <template #cell="{ record }">
            {{ formatDate(record.createdAt) }}
          </template>
        </a-table-column>
        <a-table-column title="发布时间" :width="160" align="center">
          <template #cell="{ record }">
            {{ formatDate(record.publishedAt) }}
          </template>
        </a-table-column>
        <a-table-column title="操作" :width="220" align="center" fixed="right">
          <template #cell="{ record }">
            <a-space :size="0">
              <a-button type="text" size="small" @click="handlePreview(record)">预览</a-button>
              <a-button
                v-if="record.status === 'draft'"
                type="text"
                size="small"
                status="success"
                @click="handlePublish(record)"
              >
                发布
              </a-button>
              <a-button
                v-if="record.status === 'published'"
                type="text"
                size="small"
                status="warning"
                @click="handleOffline(record)"
              >
                下线
              </a-button>
              <a-button
                v-if="record.status !== 'offline'"
                type="text"
                size="small"
                status="danger"
                @click="handleArchive(record)"
              >
                归档
              </a-button>
            </a-space>
          </template>
        </a-table-column>
      </template>
    </a-table>

    <!-- 发布确认弹窗 -->
    <a-modal
      v-model:visible="publishVisible"
      title="发布问卷"
      :ok-loading="publishing"
      @ok="confirmPublish"
      @cancel="publishVisible = false"
    >
      <p>
        确认发布问卷《<strong>{{ currentItem?.title }}</strong
        >》？
      </p>
      <p style="color: var(--color-text-3); font-size: 13px">发布后问卷将对外开放，用户可进行作答。</p>
    </a-modal>

    <!-- 下线确认弹窗 -->
    <a-modal
      v-model:visible="offlineVisible"
      title="下线问卷"
      :ok-loading="offlining"
      @ok="confirmOffline"
      @cancel="offlineVisible = false"
    >
      <p>
        确认下线问卷《<strong>{{ currentItem?.title }}</strong
        >》？
      </p>
      <p style="color: var(--color-text-3); font-size: 13px">下线后用户将无法访问该问卷，已有答卷数据不受影响。</p>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Message } from "@arco-design/web-vue";
import { IconPlus } from "@arco-design/web-vue/es/icon";
import { getSurveyList, publishSurvey, closeSurvey, deleteSurvey } from "@/api/modules/survey";
import type { SurveyListItem, SurveyStatus } from "@common/survey/survey.interface";

// ─── 展示用数据类型（后端 SurveyListItem → 前端展示字段） ──────

/** 后端 status → 前端展示状态 */
type DisplayStatus = "draft" | "published" | "offline";

interface SurveyDisplayItem {
  id: string;
  title: string;
  creator: string;
  status: DisplayStatus;
  questionCount: number;
  responseCount: number;
  createdAt: string;
  publishedAt: string | null;
}

/** 后端 SurveyListItem → 前端展示数据 */
function toDisplayItem(item: SurveyListItem): SurveyDisplayItem {
  const statusMap: Record<number, DisplayStatus> = {
    0: "draft",
    1: "published",
    2: "offline"
  };
  return {
    id: item.id,
    title: item.title,
    creator: item.user_id,
    status: statusMap[item.status] ?? "draft",
    questionCount: item.total_questions,
    responseCount: item.responses_count,
    createdAt: item.created_at,
    publishedAt: item.published_at
  };
}

// ─── 状态 ──────────────────────────────────────────────────────

const surveyList = ref<SurveyDisplayItem[]>([]);
const loading = ref(false);
const filterStatus = ref("");
const searchKeyword = ref("");
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);

// 发布/下线/归档
const publishVisible = ref(false);
const publishing = ref(false);
const offlineVisible = ref(false);
const offlining = ref(false);
const currentItem = ref<SurveyDisplayItem | null>(null);

// ─── 数据加载 ──────────────────────────────────────────────────

/** 从后端分页加载问卷列表 */
async function loadSurveyList() {
  loading.value = true;
  try {
    // 筛选状态 → 后端 status 数字
    let statusParam: number | undefined;
    if (filterStatus.value === "draft") statusParam = 0;
    else if (filterStatus.value === "published") statusParam = 1;
    else if (filterStatus.value === "offline") statusParam = 2;

    const res = await getSurveyList({
      page: currentPage.value,
      page_size: pageSize.value,
      status: statusParam as SurveyStatus | undefined,
      keyword: searchKeyword.value || undefined
    });

    if (res.code === 0 && res.data) {
      surveyList.value = res.data.surveys.map(toDisplayItem);
      total.value = res.data.total;
    }
  } catch {
    Message.error("加载问卷列表失败");
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadSurveyList();
});

// ─── 筛选 ──────────────────────────────────────────────────────

function handleFilterChange() {
  currentPage.value = 1;
  loadSurveyList();
}

function handleSearch() {
  currentPage.value = 1;
  loadSurveyList();
}

// ─── 分页 ──────────────────────────────────────────────────────

function handlePageChange(page: number) {
  currentPage.value = page;
  loadSurveyList();
}

// ─── 状态映射 ──────────────────────────────────────────────────

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "草稿",
    published: "已发布",
    offline: "已下线"
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    draft: "gray",
    published: "green",
    offline: "orange"
  };
  return map[status] ?? "gray";
}

// ─── 日期格式化 ────────────────────────────────────────────────

function formatDate(val: string | null): string {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── 操作 ──────────────────────────────────────────────────────

function handleCreate() {
  Message.info("新建问卷功能请在 Q-Editor 编辑器中操作");
}

/** 预览问卷 — 新标签页打开 C 端填答页面 */
function handlePreview(record: SurveyDisplayItem) {
  if (record.status === "draft") {
    Message.warning("草稿状态的问卷无法预览，请先发布");
    return;
  }
  window.open(`/survey/${record.id}`, "_blank");
}

function handlePublish(record: SurveyDisplayItem) {
  currentItem.value = record;
  publishVisible.value = true;
}

/** 确认发布 — 调用后端 API */
async function confirmPublish() {
  if (!currentItem.value) return;
  publishing.value = true;
  try {
    const res = await publishSurvey(currentItem.value.id);
    if (res.code === 0) {
      Message.success(`问卷「${currentItem.value.title}」已发布`);
      loadSurveyList();
    } else {
      Message.error(res.msg || "发布失败");
    }
  } catch {
    Message.error("发布失败，请检查网络连接");
  } finally {
    publishing.value = false;
    publishVisible.value = false;
    currentItem.value = null;
  }
}

function handleOffline(record: SurveyDisplayItem) {
  currentItem.value = record;
  offlineVisible.value = true;
}

/** 确认下线 — 调用后端 API */
async function confirmOffline() {
  if (!currentItem.value) return;
  offlining.value = true;
  try {
    const res = await closeSurvey(currentItem.value.id);
    if (res.code === 0) {
      Message.success(`问卷「${currentItem.value.title}」已下线`);
      loadSurveyList();
    } else {
      Message.error(res.msg || "下线失败");
    }
  } catch {
    Message.error("下线失败，请检查网络连接");
  } finally {
    offlining.value = false;
    offlineVisible.value = false;
    currentItem.value = null;
  }
}

/** 归档 — 软删除问卷 */
async function handleArchive(record: SurveyDisplayItem) {
  try {
    const res = await deleteSurvey(record.id);
    if (res.code === 0) {
      Message.success(`问卷「${record.title}」已归档`);
      loadSurveyList();
    } else {
      Message.error(res.msg || "归档失败");
    }
  } catch {
    Message.error("归档失败，请检查网络连接");
  }
}
</script>

<style scoped>
.survey-publish-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
}

.page-header {
  margin-bottom: 4px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-1);
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-3);
}

/* 筛选栏 */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-fill-2);
  border-radius: var(--radius-sm);
}

.filter-label {
  font-size: 14px;
  color: var(--color-text-2);
}

.title-link {
  color: rgb(var(--primary-6));
  cursor: pointer;
  font-weight: 500;
}

.title-link:hover {
  text-decoration: underline;
}

.text-muted {
  color: var(--color-text-3);
}
</style>
