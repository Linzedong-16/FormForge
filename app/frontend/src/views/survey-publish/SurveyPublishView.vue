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
          <a-option value="archived">已归档</a-option>
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
      :data="filteredList"
      :loading="false"
      :pagination="pagination"
      :stripe="true"
      :bordered="{ wrapper: true, cell: true }"
      column-resizable
      row-key="id"
      @page-change="handlePageChange"
    >
      <template #columns>
        <a-table-column title="问卷标题" data-index="title" :ellipsis="true" :width="260">
          <template #cell="{ record }">
            <span class="title-link">{{ record.title }}</span>
          </template>
        </a-table-column>
        <a-table-column title="创建人" data-index="creator" :width="100" align="center" />
        <a-table-column title="发布状态" :width="100" align="center">
          <template #cell="{ record }">
            <a-tag :color="statusColor(record.status)" size="small">{{ statusLabel(record.status) }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="题目数" data-index="questionCount" :width="80" align="center" />
        <a-table-column title="答卷数" data-index="responseCount" :width="80" align="center">
          <template #cell="{ record }">
            <span v-if="record.status !== 'draft'">{{ record.responseCount }}</span>
            <span v-else class="text-muted">—</span>
          </template>
        </a-table-column>
        <a-table-column title="创建时间" :width="170" align="center">
          <template #cell="{ record }">
            {{ formatDate(record.createdAt) }}
          </template>
        </a-table-column>
        <a-table-column title="发布时间" :width="170" align="center">
          <template #cell="{ record }">
            {{ formatDate(record.publishedAt) }}
          </template>
        </a-table-column>
        <a-table-column title="操作" :width="240" align="center" fixed="right">
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
              <a-button type="text" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-button type="text" size="small" status="danger" @click="handleArchive(record)">归档</a-button>
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
import { ref, computed } from "vue";
import { Message } from "@arco-design/web-vue";
import { IconPlus } from "@arco-design/web-vue/es/icon";

// ─── Mock 数据 ──────────────────────────────────────────────────

interface SurveyItem {
  id: string;
  title: string;
  creator: string;
  status: "draft" | "published" | "offline" | "archived";
  questionCount: number;
  responseCount: number;
  createdAt: string;
  publishedAt: string | null;
}

const mockSurveys: SurveyItem[] = [
  {
    id: "1",
    title: "2025 年度员工满意度调查",
    creator: "张管理",
    status: "published",
    questionCount: 25,
    responseCount: 186,
    createdAt: "2025-03-10T09:00:00Z",
    publishedAt: "2025-03-12T10:30:00Z"
  },
  {
    id: "2",
    title: "客户服务体验反馈问卷",
    creator: "李运营",
    status: "published",
    questionCount: 12,
    responseCount: 432,
    createdAt: "2025-04-05T14:20:00Z",
    publishedAt: "2025-04-06T08:00:00Z"
  },
  {
    id: "3",
    title: "新产品功能需求调研",
    creator: "王产品",
    status: "draft",
    questionCount: 18,
    responseCount: 0,
    createdAt: "2025-05-20T16:45:00Z",
    publishedAt: null
  },
  {
    id: "4",
    title: "培训课程效果评估表",
    creator: "赵培训",
    status: "published",
    questionCount: 10,
    responseCount: 67,
    createdAt: "2025-06-01T09:00:00Z",
    publishedAt: "2025-06-02T11:00:00Z"
  },
  {
    id: "5",
    title: "团建活动意向征集",
    creator: "钱行政",
    status: "offline",
    questionCount: 8,
    responseCount: 45,
    createdAt: "2025-05-15T10:00:00Z",
    publishedAt: "2025-05-16T09:00:00Z"
  },
  {
    id: "6",
    title: "内部流程优化建议收集",
    creator: "孙管理",
    status: "draft",
    questionCount: 6,
    responseCount: 0,
    createdAt: "2025-06-10T08:30:00Z",
    publishedAt: null
  },
  {
    id: "7",
    title: "2024 年终绩效考核自评",
    creator: "周 HR",
    status: "archived",
    questionCount: 30,
    responseCount: 298,
    createdAt: "2024-12-01T09:00:00Z",
    publishedAt: "2024-12-05T10:00:00Z"
  },
  {
    id: "8",
    title: "秋季校招笔试测评卷",
    creator: "吴招聘",
    status: "published",
    questionCount: 40,
    responseCount: 521,
    createdAt: "2025-09-01T09:00:00Z",
    publishedAt: "2025-09-05T08:00:00Z"
  },
  {
    id: "9",
    title: "办公环境改善意见调查",
    creator: "郑行政",
    status: "offline",
    questionCount: 15,
    responseCount: 89,
    createdAt: "2025-04-20T13:00:00Z",
    publishedAt: "2025-04-21T10:00:00Z"
  },
  {
    id: "10",
    title: "供应商服务质量评估",
    creator: "冯采购",
    status: "draft",
    questionCount: 22,
    responseCount: 0,
    createdAt: "2025-06-15T11:00:00Z",
    publishedAt: null
  }
];

// ─── 状态 ──────────────────────────────────────────────────────

const surveyList = ref<SurveyItem[]>([...mockSurveys]);
const filterStatus = ref("");
const searchKeyword = ref("");
const currentPage = ref(1);
const pageSize = ref(10);

// 发布/下线
const publishVisible = ref(false);
const publishing = ref(false);
const offlineVisible = ref(false);
const offlining = ref(false);
const currentItem = ref<SurveyItem | null>(null);

// ─── 筛选 ──────────────────────────────────────────────────────

const filteredList = computed(() => {
  let list = surveyList.value;
  if (filterStatus.value) {
    list = list.filter(item => item.status === filterStatus.value);
  }
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase();
    list = list.filter(item => item.title.toLowerCase().includes(kw));
  }
  return list;
});

// ─── 分页 ──────────────────────────────────────────────────────

const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: filteredList.value.length,
  showTotal: true,
  showPageSize: true,
  pageSizeOptions: [10, 20, 50]
}));

function handlePageChange(page: number) {
  currentPage.value = page;
}

function handleFilterChange() {
  currentPage.value = 1;
}

function handleSearch() {
  currentPage.value = 1;
}

// ─── 状态映射 ──────────────────────────────────────────────────

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "草稿",
    published: "已发布",
    offline: "已下线",
    archived: "已归档"
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    draft: "gray",
    published: "green",
    offline: "orange",
    archived: "arcoblue"
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
  Message.info("新建问卷功能待实现");
}

function handlePreview(record: SurveyItem) {
  Message.info(`预览问卷：《${record.title}》`);
}

function handleEdit(record: SurveyItem) {
  Message.info(`编辑问卷：《${record.title}》`);
}

function handlePublish(record: SurveyItem) {
  currentItem.value = record;
  publishVisible.value = true;
}

function confirmPublish() {
  publishing.value = true;
  setTimeout(() => {
    if (currentItem.value) {
      currentItem.value.status = "published";
      currentItem.value.publishedAt = new Date().toISOString();
      Message.success(`问卷「${currentItem.value.title}」已发布`);
    }
    publishing.value = false;
    publishVisible.value = false;
    currentItem.value = null;
  }, 600);
}

function handleOffline(record: SurveyItem) {
  currentItem.value = record;
  offlineVisible.value = true;
}

function confirmOffline() {
  offlining.value = true;
  setTimeout(() => {
    if (currentItem.value) {
      currentItem.value.status = "offline";
      Message.success(`问卷「${currentItem.value.title}」已下线`);
    }
    offlining.value = false;
    offlineVisible.value = false;
    currentItem.value = null;
  }, 600);
}

function handleArchive(record: SurveyItem) {
  if (record.status === "archived") {
    Message.warning("该问卷已归档");
    return;
  }
  record.status = "archived";
  Message.success(`问卷「${record.title}」已归档`);
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
  border-radius: 6px;
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
