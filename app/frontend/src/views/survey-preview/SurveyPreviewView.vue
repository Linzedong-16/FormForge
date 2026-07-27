<template>
  <div class="survey-preview-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">审核管理</h2>
      <p class="page-desc">管理平台问卷审核，支持按审核类型和状态筛选，处理审核通过或驳回操作</p>
    </div>

    <!-- 审核类型切换 + 筛选栏 -->
    <div class="filter-bar">
      <a-space :size="16">
        <span class="filter-label">审核类型：</span>
        <a-radio-group v-model="reviewType" type="button" @change="handleReviewTypeChange">
          <a-radio value="survey">问卷审核</a-radio>
          <a-radio value="template">模板审核</a-radio>
        </a-radio-group>
        <a-divider direction="vertical" />
        <span class="filter-label">审核状态：</span>
        <a-select
          v-model="filterStatus"
          placeholder="全部状态"
          allow-clear
          style="width: 140px"
          @change="handleFilterChange"
        >
          <a-option v-for="item in statusOptions" :key="item.value" :value="item.value" :label="item.label" />
        </a-select>
        <a-tag v-if="filterStatus" closable @close="clearFilter">
          {{ REVIEW_STATUS_LABELS[filterStatus] }}
        </a-tag>
      </a-space>
      <span class="result-count">共 {{ pagination.total }} 条记录</span>
    </div>

    <!-- 审核列表表格 -->
    <a-table
      :data="reviewList"
      :loading="loading"
      :pagination="tablePagination"
      :stripe="true"
      :bordered="{ wrapper: true, cell: true }"
      column-resizable
      row-key="review_id"
      @page-change="handlePageChange"
      @page-size-change="handlePageSizeChange"
      @row-click="handleRowClick"
    >
      <template #columns>
        <a-table-column title="问卷标题" data-index="survey_title" :ellipsis="true" :width="260">
          <template #cell="{ record }">
            <span class="survey-title-link">{{ record.survey_title }}</span>
          </template>
        </a-table-column>
        <a-table-column title="提交者" data-index="submitter_name" :width="100" align="center" />
        <a-table-column title="审核状态" data-index="status" :width="100" align="center">
          <template #cell="{ record }">
            <a-tag :color="REVIEW_STATUS_COLORS[record.status as ReviewStatus]">
              {{ REVIEW_STATUS_LABELS[record.status as ReviewStatus] }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column title="审核类型" data-index="review_type" :width="90" align="center">
          <template #cell="{ record }">
            <a-tag :color="record.review_type === 'template' ? 'arcoblue' : 'green'" size="small">
              {{ record.review_type === "template" ? "模板审核" : "问卷审核" }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column title="分类" data-index="category" :width="100" align="center">
          <template #cell="{ record }">
            <span v-if="record.category">{{ CATEGORY_LABELS[record.category] || record.category }}</span>
            <span v-else class="text-muted">—</span>
          </template>
        </a-table-column>
        <a-table-column title="提交说明" data-index="submit_message" :ellipsis="true" :width="180">
          <template #cell="{ record }">
            <span v-if="record.submit_message" class="text-ellipsis">{{ record.submit_message }}</span>
            <span v-else class="text-muted">—</span>
          </template>
        </a-table-column>
        <a-table-column title="提交时间" data-index="submitted_at" :width="170" align="center">
          <template #cell="{ record }">
            {{ formatDateTime(record.submitted_at) }}
          </template>
        </a-table-column>
        <a-table-column title="操作" :width="200" align="center" fixed="right">
          <template #cell="{ record }">
            <a-space v-if="record.status === 'pending'" :size="4">
              <a-button type="text" size="small" status="success" @click.stop="handleApprove(record)"> 通过 </a-button>
              <a-button type="text" size="small" status="danger" @click.stop="handleReject(record)"> 驳回 </a-button>
              <a-button type="text" size="small" @click.stop="handleViewDetail(record)"> 查看详情 </a-button>
            </a-space>
            <a-button v-else-if="record.review_id" type="text" size="small" @click.stop="handleViewDetail(record)">
              查看详情
            </a-button>
            <span v-else class="text-muted" style="font-size: 12px">待用户提交</span>
          </template>
        </a-table-column>
      </template>
    </a-table>

    <!-- 空状态提示 -->
    <a-result
      v-if="!loading && reviewList.length === 0 && !errorMsg"
      status="404"
      title="暂无匹配的审核记录"
      subtitle="请尝试调整筛选条件"
    />

    <!-- 错误状态 -->
    <a-result v-if="errorMsg" status="error" title="数据加载失败" :subtitle="errorMsg">
      <template #extra>
        <a-button type="primary" @click="loadList">重试</a-button>
      </template>
    </a-result>

    <!-- 审核通过确认弹窗 -->
    <a-modal
      v-model:visible="approveModalVisible"
      title="审核通过确认"
      :ok-loading="approving"
      @ok="confirmApprove"
      @cancel="cancelApprove"
    >
      <p>
        确认通过问卷《<strong>{{ currentReview?.survey_title }}</strong
        >》的审核？
      </p>
      <a-textarea
        v-model="approveComment"
        placeholder="审核意见（可选，最多 500 字符）"
        :max-length="500"
        :auto-size="{ minRows: 2, maxRows: 4 }"
        style="margin-top: 12px"
      />
    </a-modal>

    <!-- 审核驳回确认弹窗 -->
    <a-modal
      v-model:visible="rejectModalVisible"
      title="审核驳回"
      :ok-loading="rejecting"
      @ok="confirmReject"
      @cancel="cancelReject"
    >
      <p>
        驳回问卷《<strong>{{ currentReview?.survey_title }}</strong
        >》的审核，请填写驳回原因：
      </p>
      <a-textarea
        v-model="rejectComment"
        placeholder="驳回原因（必填，最多 500 字符）"
        :max-length="500"
        :auto-size="{ minRows: 3, maxRows: 6 }"
        style="margin-top: 12px"
      />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Message } from "@arco-design/web-vue";
import {
  getReviewList,
  approveReview,
  rejectReview,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_COLORS,
  type ReviewListItem,
  type ReviewStatus,
  type ReviewType
} from "@/api/modules/review";

const router = useRouter();

// ── 常量 ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  education: "教育",
  market: "市场调研",
  hr: "人力资源",
  customer: "客户服务",
  event: "活动",
  other: "其他"
};

// ── 状态 ──────────────────────────────────────────────────────

const loading = ref(false);
const errorMsg = ref("");
const reviewList = ref<ReviewListItem[]>([]);
const reviewType = ref<ReviewType>("survey");
const filterStatus = ref<ReviewStatus | null>(null);
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);

// ── 审核操作相关 ──────────────────────────────────────────────

const approveModalVisible = ref(false);
const rejectModalVisible = ref(false);
const approving = ref(false);
const rejecting = ref(false);
const approveComment = ref("");
const rejectComment = ref("");
const currentReview = ref<ReviewListItem | null>(null);

// ── 筛选选项 ──────────────────────────────────────────────────

const statusOptions = computed(() =>
  Object.entries(REVIEW_STATUS_LABELS).map(([value, label]) => ({
    value: value as ReviewStatus,
    label
  }))
);

// ── 分页配置 ──────────────────────────────────────────────────

const tablePagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: total.value,
  showTotal: true,
  showPageSize: true,
  pageSizeOptions: [10, 20, 50]
}));

const pagination = computed(() => ({
  page: currentPage.value,
  page_size: pageSize.value,
  total: total.value,
  total_pages: Math.ceil(total.value / pageSize.value)
}));

// ── 格式化日期 ────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── 加载列表 ──────────────────────────────────────────────────

async function loadList() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const params: { review_type: ReviewType; status?: ReviewStatus; page: number; page_size: number } = {
      review_type: reviewType.value,
      page: currentPage.value,
      page_size: pageSize.value
    };
    if (filterStatus.value) {
      params.status = filterStatus.value;
    } else {
      params.status = "pending";
    }

    const res = await getReviewList(params);
    if (res.data) {
      reviewList.value = res.data.list;
      total.value = res.data.pagination.total;
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "加载审核列表失败";
    reviewList.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadList();
});

// ── 筛选处理 ──────────────────────────────────────────────────

function handleReviewTypeChange(value: ReviewType) {
  reviewType.value = value;
  filterStatus.value = null;
  currentPage.value = 1;
  loadList();
}

function handleFilterChange(value: string | number | Record<string, unknown> | undefined) {
  filterStatus.value = (value as ReviewStatus) ?? null;
  currentPage.value = 1;
  loadList();
}

function clearFilter() {
  filterStatus.value = null;
  currentPage.value = 1;
  loadList();
}

// ── 分页处理 ──────────────────────────────────────────────────

function handlePageChange(page: number) {
  currentPage.value = page;
  loadList();
}

function handlePageSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
  loadList();
}

// ── 行点击 / 查看详情 ─────────────────────────────────────────

function handleRowClick(record: ReviewListItem) {
  handleViewDetail(record);
}

function handleViewDetail(record: ReviewListItem) {
  const resolved = router.resolve({
    name: "surveyPreviewDetail",
    params: { id: record.review_id }
  });
  window.open(resolved.href, "_blank");
}

// ── 审核通过 ──────────────────────────────────────────────────

function handleApprove(record: ReviewListItem) {
  currentReview.value = record;
  approveComment.value = "";
  approveModalVisible.value = true;
}

async function confirmApprove() {
  if (!currentReview.value) return;
  approving.value = true;
  try {
    await approveReview(currentReview.value.review_id, {
      review_comment: approveComment.value || undefined
    });
    Message.success("审核通过");
    approveModalVisible.value = false;
    currentReview.value = null;
    await loadList();
  } catch (err) {
    Message.error(err instanceof Error ? err.message : "审核操作失败");
  } finally {
    approving.value = false;
  }
}

function cancelApprove() {
  approveModalVisible.value = false;
  currentReview.value = null;
  approveComment.value = "";
}

// ── 审核驳回 ──────────────────────────────────────────────────

function handleReject(record: ReviewListItem) {
  currentReview.value = record;
  rejectComment.value = "";
  rejectModalVisible.value = true;
}

async function confirmReject() {
  if (!currentReview.value) return;
  if (!rejectComment.value.trim()) {
    Message.warning("请填写驳回原因");
    return;
  }
  rejecting.value = true;
  try {
    await rejectReview(currentReview.value.review_id, {
      review_comment: rejectComment.value.trim()
    });
    Message.success("审核已驳回");
    rejectModalVisible.value = false;
    currentReview.value = null;
    await loadList();
  } catch (err) {
    Message.error(err instanceof Error ? err.message : "审核操作失败");
  } finally {
    rejecting.value = false;
  }
}

function cancelReject() {
  rejectModalVisible.value = false;
  currentReview.value = null;
  rejectComment.value = "";
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
  border-radius: var(--radius-sm);
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

.text-muted {
  color: var(--color-text-3);
}

.text-ellipsis {
  display: inline-block;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 表格行 hover 指针 */
:deep(.arco-table-tr) {
  cursor: pointer;
}
</style>
