<template>
  <div class="survey-preview-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">问卷预览</h2>
      <p class="page-desc">管理平台所有问卷，支持按审核状态筛选，点击行查看问卷渲染效果</p>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <a-space>
        <span class="filter-label">审核状态：</span>
        <a-select
          v-model="filterStatus"
          placeholder="全部状态"
          allow-clear
          style="width: 160px"
          @change="handleFilterChange"
        >
          <a-option v-for="item in statusOptions" :key="item.value" :value="item.value" :label="item.label" />
        </a-select>
        <a-tag v-if="filterStatus" closable @close="clearFilter">
          {{ REVIEW_STATUS_LABELS[filterStatus] }}
        </a-tag>
      </a-space>
      <span class="result-count">共 {{ filteredList.length }} 条记录</span>
    </div>

    <!-- 问卷列表表格 -->
    <a-table
      :data="filteredList"
      :loading="loading"
      :pagination="false"
      :stripe="true"
      :bordered="{ wrapper: true, cell: true }"
      column-resizable
      row-key="id"
      @row-click="handleRowClick"
    >
      <template #columns>
        <a-table-column title="问卷标题" data-index="title" :ellipsis="true" :width="280">
          <template #cell="{ record }">
            <span class="survey-title-link">{{ record.title }}</span>
          </template>
        </a-table-column>
        <a-table-column title="审核状态" data-index="reviewStatus" :width="120" align="center">
          <template #cell="{ record }">
            <a-tag :color="REVIEW_STATUS_COLORS[record.reviewStatus as ReviewStatus]">
              {{ REVIEW_STATUS_LABELS[record.reviewStatus as ReviewStatus] }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column title="类型" data-index="surveyType" :width="100" align="center">
          <template #cell="{ record }">
            <a-tag :color="record.surveyType === 'template' ? 'arcoblue' : 'gray'">
              {{ record.surveyType === "template" ? "模板" : "个人" }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column
          title="题目数"
          data-index="questionCount"
          :width="100"
          align="center"
          :sortable="{ sortDirections: ['ascend', 'descend'] }"
        />
        <a-table-column title="作者" data-index="author" :width="100" align="center" />
        <a-table-column title="创建时间" data-index="createdAt" :width="180" align="center">
          <template #cell="{ record }">
            {{ formatDateTime(record.createdAt) }}
          </template>
        </a-table-column>
        <a-table-column title="更新时间" data-index="updatedAt" :width="180" align="center">
          <template #cell="{ record }">
            {{ formatDateTime(record.updatedAt) }}
          </template>
        </a-table-column>
        <a-table-column title="操作" :width="120" align="center" fixed="right">
          <template #cell="{ record }">
            <a-button type="text" size="small" @click.stop="handleViewDetail(record)"> 查看详情 </a-button>
          </template>
        </a-table-column>
      </template>
    </a-table>

    <!-- 空状态提示 -->
    <a-result
      v-if="!loading && filteredList.length === 0"
      status="404"
      title="暂无匹配的问卷记录"
      subtitle="请尝试调整筛选条件"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import type { ReviewStatus, MockSurveyItem } from "@/api/modules/survey-preview/mockData";
import {
  getMockSurveyList,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_COLORS,
  mockDelay
} from "@/api/modules/survey-preview/mockData";

const router = useRouter();

// ── 状态 ──────────────────────────────────────────────────────

const loading = ref(false);
const filterStatus = ref<ReviewStatus | null>(null);
const surveyList = ref<MockSurveyItem[]>([]);

// ── 筛选选项 ──────────────────────────────────────────────────

const statusOptions = computed(() =>
  Object.entries(REVIEW_STATUS_LABELS).map(([value, label]) => ({
    value: value as ReviewStatus,
    label
  }))
);

// ── 筛选后的列表 ──────────────────────────────────────────────

const filteredList = computed(() => {
  if (!filterStatus.value) return surveyList.value;
  return surveyList.value.filter(item => item.reviewStatus === filterStatus.value);
});

// ── 格式化日期 ────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── 加载列表 ──────────────────────────────────────────────────

async function loadList() {
  loading.value = true;
  try {
    await mockDelay(400);
    surveyList.value = getMockSurveyList();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadList();
});

// ── 筛选处理 ──────────────────────────────────────────────────

function handleFilterChange(value: ReviewStatus | undefined) {
  filterStatus.value = value ?? null;
}

function clearFilter() {
  filterStatus.value = null;
}

// ── 行点击 / 查看详情（在新标签页打开） ──────────────────────

function handleRowClick(record: MockSurveyItem) {
  handleViewDetail(record);
}

function handleViewDetail(record: MockSurveyItem) {
  // 使用 router.resolve 生成完整 URL，在新标签页打开
  const resolved = router.resolve({
    name: "surveyPreviewDetail",
    params: { id: record.id }
  });
  window.open(resolved.href, "_blank");
}
</script>

<style scoped>
.survey-preview-page {
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

.result-count {
  font-size: 13px;
  color: var(--color-text-3);
}

/* 表格 */
.survey-title-link {
  color: rgb(var(--primary-6));
  cursor: pointer;
  font-weight: 500;
}

.survey-title-link:hover {
  text-decoration: underline;
}

/* 表格行 hover 指针 */
:deep(.arco-table-tr) {
  cursor: pointer;
}
</style>
