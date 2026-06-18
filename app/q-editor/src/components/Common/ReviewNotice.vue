<template>
  <!-- 审核消息通知：popover 下拉框，trigger=click -->
  <el-popover
    placement="bottom-end"
    trigger="click"
    :width="480"
    :show-arrow="false"
    :offset="10"
    popper-class="review-notice-popover"
    @show="onPopoverShow"
  >
    <template #reference>
      <el-badge :value="reviewCount" :hidden="reviewCount === 0" class="review-notice-trigger">
        <el-button :icon="Bell" circle size="small" :title="t('common.reviewNotice')" />
      </el-badge>
    </template>

    <div class="review-notice-panel">
      <!-- 标题栏 -->
      <div class="panel-header">
        <span class="panel-title">{{ t("common.reviewNotice") }}</span>
        <span v-if="records.length > 0" class="panel-count">{{ records.length }} {{ t("common.items") }}</span>
      </div>

      <div class="panel-divider"></div>

      <!-- 加载中 -->
      <div v-if="loading" class="panel-loading">
        <el-icon class="loading-icon"><Loading /></el-icon>
        <span>{{ t("common.loading") }}</span>
      </div>

      <!-- 空状态 -->
      <div v-else-if="records.length === 0" class="panel-empty">
        <el-icon class="empty-icon"><Document /></el-icon>
        <span>{{ t("common.noReviewRecords") }}</span>
      </div>

      <!-- 审核记录列表 -->
      <div v-else class="record-list">
        <div v-for="record in records" :key="record.id" class="record-item">
          <!-- 问卷基础信息区 -->
          <div class="record-info">
            <span class="record-id">#{{ record.surveyId }}</span>
            <span class="record-title" :title="record.title">{{ record.title }}</span>
          </div>

          <!-- 状态标识区 -->
          <div class="record-status">
            <el-tag :type="statusTagType(record.status)" size="small" effect="plain">
              {{ t(statusLabelKey(record.status)) }}
            </el-tag>
          </div>

          <!-- 操作按钮区 -->
          <div class="record-actions">
            <el-button size="small" text type="info" @click.stop="onRevoke(record)">
              {{ t("common.revoke") }}
            </el-button>
            <el-button size="small" text type="primary" @click.stop="onViewDetail(record)">
              {{ t("common.viewDetail") }}
            </el-button>
            <el-button size="small" text type="warning" @click.stop="onEdit(record)">
              {{ t("common.edit") }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Bell, Loading, Document } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// ─── 类型定义 ────────────────────────────────────────────────

/** 审核状态 */
type ReviewStatus = "in_progress" | "approved" | "violated";

/** 审核记录 */
interface ReviewRecord {
  id: string;
  surveyId: string;
  title: string;
  status: ReviewStatus;
}

// ─── 状态映射 ────────────────────────────────────────────────

const statusTagType = (status: ReviewStatus): "warning" | "success" | "danger" => {
  const map: Record<ReviewStatus, "warning" | "success" | "danger"> = {
    in_progress: "warning",
    approved: "success",
    violated: "danger"
  };
  return map[status];
};

const statusLabelKeyMap: Record<ReviewStatus, string> = {
  in_progress: "common.statusInProgress",
  approved: "common.statusApproved",
  violated: "common.statusViolated"
};

const statusLabelKey = (status: ReviewStatus) => statusLabelKeyMap[status];

// ─── 状态 ────────────────────────────────────────────────────

const loading = ref(false);
const records = ref<ReviewRecord[]>([]);

/** 待处理审核数量 */
const reviewCount = computed(() => records.value.filter(r => r.status === "in_progress").length);

// ─── 假数据 ──────────────────────────────────────────────────

const mockRecords: ReviewRecord[] = [
  {
    id: "1",
    surveyId: "SUR-20240001",
    title: "2024 年度员工满意度调查问卷",
    status: "in_progress"
  },
  {
    id: "2",
    surveyId: "SUR-20240002",
    title: "产品使用体验反馈收集表",
    status: "in_progress"
  },
  {
    id: "3",
    surveyId: "SUR-20240003",
    title: "市场调研—消费习惯分析",
    status: "approved"
  },
  {
    id: "4",
    surveyId: "SUR-20240004",
    title: "客户服务满意度评价",
    status: "violated"
  },
  {
    id: "5",
    surveyId: "SUR-20240005",
    title: "新员工入职培训效果评估",
    status: "in_progress"
  }
];

// ─── 生命周期 ────────────────────────────────────────────────

/** 下拉框打开时加载数据 */
const onPopoverShow = async () => {
  loading.value = true;
  // TODO: 对接实际接口，替换为真实 API 请求
  await fakeFetch();
  loading.value = false;
};

/** 模拟接口延迟 */
const fakeFetch = () =>
  new Promise<void>(resolve => {
    setTimeout(() => {
      records.value = mockRecords;
      resolve();
    }, 600);
  });

// ─── 操作（当前仅样式占位） ──────────────────────────────────

const onRevoke = (record: ReviewRecord) => {
  // TODO: 实现撤销逻辑
  console.log("[ReviewNotice] revoke", record);
};

const onViewDetail = (record: ReviewRecord) => {
  // TODO: 实现查看详情逻辑
  console.log("[ReviewNotice] view detail", record);
};

const onEdit = (record: ReviewRecord) => {
  // TODO: 实现编辑逻辑
  console.log("[ReviewNotice] edit", record);
};
</script>

<style scoped lang="scss">
.review-notice-trigger {
  cursor: pointer;
}

.review-notice-panel {
  display: flex;
  flex-direction: column;
  max-height: 400px;
}

// 标题栏
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--font-color);
}

.panel-count {
  font-size: 12px;
  color: var(--font-color-lighter);
}

.panel-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 0 0 4px;
}

// 加载 / 空状态
.panel-loading,
.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 12px;
  font-size: 14px;
  color: var(--font-color-lighter);
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  font-size: 28px;
  color: var(--font-color-lightest);
}

// 记录列表
.record-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.record-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: var(--border-radius-md);
  transition: background-color 0.15s ease;

  &:hover {
    background-color: var(--background-color);
  }

  & + & {
    border-top: 1px solid transparent;

    &:hover {
      border-top-color: transparent;
    }
  }
}

// 问卷信息区
.record-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.record-id {
  font-size: 11px;
  color: var(--font-color-lighter);
  font-weight: 500;
}

.record-title {
  font-size: 13px;
  color: var(--font-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 状态标识区
.record-status {
  flex-shrink: 0;
}

// 操作按钮区
.record-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
</style>

<!-- 非 scoped：覆盖 el-popover 弹层，统一 shadcn 风格 -->
<style lang="scss">
.review-notice-popover.el-popover.el-popper {
  padding: 6px;
  border-radius: var(--border-radius-lg);
  box-shadow: var(--el-box-shadow);
  border: 1px solid var(--border-color);
}
</style>
