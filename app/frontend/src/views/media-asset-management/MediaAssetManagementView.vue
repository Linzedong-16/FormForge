<template>
  <div class="media-asset-page">
    <!-- 页面标题 + 筛选/操作 -->
    <div class="page-toolbar">
      <div>
        <h3 class="page-title">物料管理</h3>
        <span class="page-subtitle">统一管理全平台问卷题目图片、签名图片、用户头像等图片资源</span>
      </div>
      <a-space>
        <a-input-search
          v-model="filters.keyword"
          placeholder="按文件名搜索"
          style="width: 200px"
          allow-clear
          @search="handleFilterChange"
          @clear="handleFilterChange"
        />
        <a-input
          v-model="filters.user_id"
          placeholder="按用户 ID 筛选"
          style="width: 150px"
          allow-clear
          @change="handleFilterChange"
        />
        <a-input
          v-model="filters.survey_id"
          placeholder="按问卷 ID 筛选"
          style="width: 150px"
          allow-clear
          @change="handleFilterChange"
        />
        <a-select
          v-model="filters.review_status"
          placeholder="按审核状态筛选"
          style="width: 150px"
          allow-clear
          @change="handleFilterChange"
        >
          <a-option value="pending">待审核</a-option>
          <a-option value="approved">已通过</a-option>
          <a-option value="rejected">已驳回</a-option>
        </a-select>
        <a-button v-if="selectedIds.length > 0" status="danger" @click="handleBatchDelete">
          批量删除（{{ selectedIds.length }}）
        </a-button>
        <a-button type="primary" @click="uploadDialogVisible = true">
          <template #icon><icon-upload /></template>
          上传物料
        </a-button>
      </a-space>
    </div>

    <!-- 物料表格 -->
    <a-table
      :data="mediaAssetList"
      :loading="loading"
      :pagination="pagination"
      :bordered="{ wrapper: true, cell: true }"
      :row-selection="rowSelection"
      row-key="id"
      column-resizable
      @page-change="handlePageChange"
      @selection-change="handleSelectionChange"
    >
      <template #columns>
        <a-table-column title="预览" :width="80" align="center">
          <template #cell="{ record }">
            <a-image :src="record.file_url" width="48" height="48" fit="cover" :preview="true" />
          </template>
        </a-table-column>
        <a-table-column title="文件名" data-index="file_name" :ellipsis="true" :tooltip="true" />
        <a-table-column title="类型" :width="120" align="center">
          <template #cell="{ record }">
            <a-tag size="small">{{ record.file_type }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="审核状态" :width="110" align="center">
          <template #cell="{ record }">
            <a-tag :color="reviewStatusColor(record.review_status)" size="small">
              {{ reviewStatusLabel(record.review_status) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column title="所属用户" data-index="user_id" :width="100" align="center" />
        <a-table-column title="所属问卷" data-index="survey_id" :width="100" align="center">
          <template #cell="{ record }">{{ record.survey_id ?? "—" }}</template>
        </a-table-column>
        <a-table-column title="大小" :width="90" align="center">
          <template #cell="{ record }">{{ formatFileSize(record.file_size) }}</template>
        </a-table-column>
        <a-table-column title="上传时间" data-index="created_at" :width="170" align="center">
          <template #cell="{ record }">{{ formatDate(record.created_at) }}</template>
        </a-table-column>
        <a-table-column title="操作" :width="160" align="center" fixed="right">
          <template #cell="{ record }">
            <a-space :size="0">
              <a-button type="text" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-button type="text" size="small" status="danger" @click="handleDelete(record)">删除</a-button>
            </a-space>
          </template>
        </a-table-column>
      </template>
    </a-table>

    <!-- 元信息/审核状态编辑 -->
    <MediaAssetEditDrawer v-model:visible="editDrawerVisible" :media-asset-id="editingId" @updated="fetchMediaAssets" />

    <!-- 直接上传新物料 -->
    <MediaAssetUploadDialog v-model:visible="uploadDialogVisible" @uploaded="fetchMediaAssets" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { Message, Modal } from "@arco-design/web-vue";
import { IconUpload } from "@arco-design/web-vue/es/icon";
import {
  getMediaAssetList,
  deleteMediaAsset,
  batchDeleteMediaAssets,
  MEDIA_ASSET_REVIEW_STATUS_LABELS,
  MEDIA_ASSET_REVIEW_STATUS_COLORS,
  type MediaAssetItem,
  type MediaAssetReference
} from "@/api/modules/media-asset";
import MediaAssetEditDrawer from "./components/MediaAssetEditDrawer.vue";
import MediaAssetUploadDialog from "./components/MediaAssetUploadDialog.vue";

// ─── 列表状态 ──────────────────────────────────────────────────
const mediaAssetList = ref<MediaAssetItem[]>([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);

const filters = reactive({
  keyword: "",
  user_id: "",
  survey_id: "",
  review_status: undefined as string | undefined
});

// ─── 分页 ──────────────────────────────────────────────────────
const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: total.value,
  showTotal: true,
  showPageSize: true,
  pageSizeOptions: [10, 20, 50]
}));

function handlePageChange(page: number) {
  currentPage.value = page;
  fetchMediaAssets();
}

function handleFilterChange() {
  currentPage.value = 1;
  fetchMediaAssets();
}

// ─── 多选批量删除 ──────────────────────────────────────────────
const selectedIds = ref<string[]>([]);
const rowSelection = reactive({ type: "checkbox" as const, showCheckedAll: true });

function handleSelectionChange(keys: (string | number)[]) {
  selectedIds.value = keys.map(String);
}

// ─── 数据获取 ──────────────────────────────────────────────────
async function fetchMediaAssets() {
  loading.value = true;
  try {
    const res = await getMediaAssetList({
      page: currentPage.value,
      page_size: pageSize.value,
      keyword: filters.keyword || undefined,
      user_id: filters.user_id || undefined,
      survey_id: filters.survey_id || undefined,
      review_status: filters.review_status as MediaAssetItem["review_status"] | undefined
    });
    if (res.data) {
      mediaAssetList.value = res.data.list;
      total.value = res.data.pagination.total;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "获取物料列表失败";
    Message.error(msg);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchMediaAssets();
});

// ─── 编辑 ──────────────────────────────────────────────────────
const editDrawerVisible = ref(false);
const editingId = ref<string | null>(null);

function handleEdit(record: MediaAssetItem) {
  editingId.value = record.id;
  editDrawerVisible.value = true;
}

// ─── 上传 ──────────────────────────────────────────────────────
const uploadDialogVisible = ref(false);

// ─── 删除（存在有效引用时提示具体来源，见 spec.md FR-014） ─────

function formatReferences(references: MediaAssetReference[]): string {
  return references
    .map(r => (r.type === "survey_component" ? `问卷「${r.survey_title}」的题目` : `用户 ${r.user_id} 的当前头像`))
    .join("；");
}

function handleDelete(record: MediaAssetItem) {
  Modal.confirm({
    title: "确认删除",
    content: `确定删除物料「${record.file_name}」？此操作不可撤销。`,
    okText: "确认删除",
    cancelText: "取消",
    maskClosable: false,
    onOk: async () => {
      try {
        const res = await deleteMediaAsset(record.id);
        if (res.code === 0) {
          Message.success("物料已删除");
          fetchMediaAssets();
        } else {
          // code !== 0 表示存在有效引用（后端以 200 承载，见 api/modules/media-asset 说明）
          const references = res.data?.references ?? [];
          Message.error(`删除被阻止：该物料仍被以下内容引用 —— ${formatReferences(references)}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "删除失败";
        Message.error(msg);
      }
    }
  });
}

function handleBatchDelete() {
  Modal.confirm({
    title: "确认批量删除",
    content: `确定删除选中的 ${selectedIds.value.length} 条物料？仍被引用的物料会被跳过并单独报告。`,
    okText: "确认删除",
    cancelText: "取消",
    maskClosable: false,
    onOk: async () => {
      try {
        const res = await batchDeleteMediaAssets(selectedIds.value);
        if (res.data) {
          const { succeeded, failed } = res.data;
          if (succeeded.length > 0) {
            Message.success(`成功删除 ${succeeded.length} 条`);
          }
          if (failed.length > 0) {
            Message.warning(`${failed.length} 条删除失败（多为仍被引用），详情见列表`);
          }
          selectedIds.value = [];
          fetchMediaAssets();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "批量删除失败";
        Message.error(msg);
      }
    }
  });
}

// ─── 格式化 ────────────────────────────────────────────────────

// 表格 #cell 插槽的 record 未强类型化，直接索引 Record<ReviewStatus,string> 会触发
// TS7053；改为函数参数接收，与 UserListView.vue 的 roleLabel/roleColor 写法保持一致
function reviewStatusLabel(status: string): string {
  return MEDIA_ASSET_REVIEW_STATUS_LABELS[status as keyof typeof MEDIA_ASSET_REVIEW_STATUS_LABELS] ?? status;
}
function reviewStatusColor(status: string): string {
  return MEDIA_ASSET_REVIEW_STATUS_COLORS[status as keyof typeof MEDIA_ASSET_REVIEW_STATUS_COLORS] ?? "gray";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDate(val: string | null): string {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<style scoped>
.media-asset-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.page-subtitle {
  font-size: 13px;
  color: var(--color-text-3);
}
</style>
