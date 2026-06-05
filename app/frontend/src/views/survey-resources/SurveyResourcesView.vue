<template>
  <div class="resources-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="title-area">
        <h2 class="page-title">问卷配置资源管理</h2>
        <p class="page-desc">管理已上传至服务端的问卷 JSON 配置文件</p>
      </div>
      <a-button type="primary" @click="handleUpload">
        <template #icon><icon-upload /></template>
        上传配置文件
      </a-button>
    </div>

    <!-- 操作工具栏 -->
    <a-card :bordered="false" :body-style="{ padding: '16px' }">
      <a-row :gutter="16" align="center">
        <a-col :flex="1">
          <a-input-search
            v-model="searchKeyword"
            placeholder="搜索文件名或问卷标题..."
            allow-clear
            style="max-width: 340px"
            @search="handleSearch"
          />
        </a-col>
        <a-col>
          <a-space>
            <a-select v-model="statusFilter" placeholder="状态筛选" style="width: 120px" allow-clear>
              <a-option value="active">已启用</a-option>
              <a-option value="draft">草稿</a-option>
              <a-option value="archived">已归档</a-option>
            </a-select>
            <a-button status="danger" :disabled="selectedRows.length === 0" @click="handleBatchDelete">
              批量删除 {{ selectedRows.length > 0 ? `(${selectedRows.length})` : "" }}
            </a-button>
          </a-space>
        </a-col>
      </a-row>
    </a-card>

    <!-- 文件列表 -->
    <a-card :bordered="false">
      <a-table
        :data="filteredResources"
        :columns="columns"
        :row-selection="{ type: 'checkbox', onChange: onRowSelectChange }"
        :pagination="{ pageSize: 10, showTotal: true }"
        row-key="id"
      >
        <!-- 文件名列（含图标） -->
        <template #fileName="{ record }">
          <a-space>
            <icon-folder style="color: rgb(var(--arcoblue-6))" />
            <span>{{ record.fileName }}</span>
          </a-space>
        </template>

        <!-- 状态列 -->
        <template #status="{ record }">
          <a-tag :color="statusColorMap[record.status]">{{ statusLabelMap[record.status] }}</a-tag>
        </template>

        <!-- 文件大小列 -->
        <template #fileSize="{ record }">
          {{ formatSize(record.fileSize) }}
        </template>

        <!-- 操作列 -->
        <template #operations="{ record }">
          <a-space>
            <a-button type="text" size="small" @click="handlePreview(record)">预览</a-button>
            <a-button type="text" size="small" @click="handleDownload(record)">下载</a-button>
            <a-button type="text" size="small" status="danger" @click="handleDelete(record)">删除</a-button>
          </a-space>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Message } from "@arco-design/web-vue";

interface ResourceItem {
  id: string;
  fileName: string;
  surveyTitle: string;
  fileSize: number; // 字节
  status: "active" | "draft" | "archived";
  uploadTime: string;
  uploader: string;
}

const searchKeyword = ref("");
const statusFilter = ref<string | undefined>(undefined);
const selectedRows = ref<string[]>([]);

const statusColorMap: Record<string, string> = {
  active: "green",
  draft: "orange",
  archived: "gray"
};

const statusLabelMap: Record<string, string> = {
  active: "已启用",
  draft: "草稿",
  archived: "已归档"
};

// 列定义
const columns = [
  { title: "文件名", dataIndex: "fileName", slotName: "fileName", ellipsis: true },
  { title: "问卷标题", dataIndex: "surveyTitle", ellipsis: true },
  { title: "文件大小", dataIndex: "fileSize", slotName: "fileSize", width: 110 },
  { title: "状态", dataIndex: "status", slotName: "status", width: 100 },
  { title: "上传时间", dataIndex: "uploadTime", width: 170 },
  { title: "上传人", dataIndex: "uploader", width: 100 },
  { title: "操作", slotName: "operations", width: 160 }
];

// 占位数据
const resources = ref<ResourceItem[]>([
  {
    id: "r001",
    fileName: "survey_satisfaction_2024.json",
    surveyTitle: "用户满意度调查 2024",
    fileSize: 24576,
    status: "active",
    uploadTime: "2024-12-01 10:23",
    uploader: "admin"
  },
  {
    id: "r002",
    fileName: "survey_product_feedback.json",
    surveyTitle: "产品功能需求调研",
    fileSize: 18432,
    status: "active",
    uploadTime: "2024-11-28 15:47",
    uploader: "editor01"
  },
  {
    id: "r003",
    fileName: "survey_employee_eval.json",
    surveyTitle: "员工年度评估问卷",
    fileSize: 32768,
    status: "draft",
    uploadTime: "2024-11-20 09:12",
    uploader: "hr_admin"
  },
  {
    id: "r004",
    fileName: "survey_market_q4.json",
    surveyTitle: "市场调研问卷 Q4",
    fileSize: 15360,
    status: "archived",
    uploadTime: "2024-10-15 14:30",
    uploader: "admin"
  },
  {
    id: "r005",
    fileName: "survey_nps_score.json",
    surveyTitle: "NPS 评分问卷",
    fileSize: 9216,
    status: "active",
    uploadTime: "2024-12-03 11:05",
    uploader: "editor02"
  }
]);

// 根据搜索词和状态筛选
const filteredResources = computed(() => {
  return resources.value.filter(item => {
    const matchKeyword =
      !searchKeyword.value ||
      item.fileName.includes(searchKeyword.value) ||
      item.surveyTitle.includes(searchKeyword.value);
    const matchStatus = !statusFilter.value || item.status === statusFilter.value;
    return matchKeyword && matchStatus;
  });
});

// 格式化文件大小
const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const handleSearch = () => {
  // 搜索通过 computed 自动过滤，此处可添加埋点
};

const onRowSelectChange = (keys: string[]) => {
  selectedRows.value = keys;
};

const handleUpload = () => {
  // TODO: 打开上传弹窗
  Message.info("上传功能开发中");
};

const handlePreview = (record: ResourceItem) => {
  Message.info(`预览：${record.surveyTitle}`);
};

const handleDownload = (record: ResourceItem) => {
  Message.info(`下载：${record.fileName}`);
};

const handleDelete = (record: ResourceItem) => {
  resources.value = resources.value.filter(r => r.id !== record.id);
  Message.success(`已删除：${record.fileName}`);
};

const handleBatchDelete = () => {
  resources.value = resources.value.filter(r => !selectedRows.value.includes(r.id));
  Message.success(`已删除 ${selectedRows.value.length} 个文件`);
  selectedRows.value = [];
};
</script>

<style scoped>
.resources-page {
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
</style>
