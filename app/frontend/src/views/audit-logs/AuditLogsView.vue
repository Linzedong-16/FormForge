<template>
  <div class="audit-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="title-area">
        <h2 class="page-title">系统日志审计</h2>
        <p class="page-desc">记录系统操作行为，追踪用户操作与安全事件</p>
      </div>
      <a-button type="outline" @click="handleExport">
        <template #icon><icon-download /></template>
        导出日志
      </a-button>
    </div>

    <!-- 筛选工具栏 -->
    <a-card :bordered="false" :body-style="{ padding: '16px' }">
      <div class="filter-toolbar">
        <a-range-picker v-model="dateRange" style="width: 280px" />
        <a-select v-model="levelFilter" placeholder="日志级别" style="width: 130px" allow-clear>
          <a-option value="info">INFO</a-option>
          <a-option value="warn">WARN</a-option>
          <a-option value="error">ERROR</a-option>
        </a-select>
        <a-select v-model="moduleFilter" placeholder="操作模块" style="width: 150px" allow-clear>
          <a-option value="auth">认证授权</a-option>
          <a-option value="survey">问卷管理</a-option>
          <a-option value="resource">资源管理</a-option>
          <a-option value="token">Token 管理</a-option>
        </a-select>
        <a-input-search v-model="userKeyword" placeholder="操作用户" style="width: 180px" allow-clear />
        <div class="filter-actions">
          <a-button type="primary" @click="handleFilter">查询</a-button>
          <a-button style="margin-left: 8px" @click="handleReset">重置</a-button>
        </div>
      </div>
    </a-card>

    <!-- 日志统计 -->
    <a-row :gutter="12">
      <a-col :span="6">
        <a-card :bordered="false" :body-style="{ padding: '16px' }">
          <a-statistic title="今日日志总数" :value="1284" :value-style="{ fontSize: '24px' }" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" :body-style="{ padding: '16px' }">
          <a-statistic
            title="警告日志"
            :value="23"
            :value-style="{ fontSize: '24px', color: 'rgb(var(--orange-6))' }"
          />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" :body-style="{ padding: '16px' }">
          <a-statistic title="错误日志" :value="5" :value-style="{ fontSize: '24px', color: 'rgb(var(--red-6))' }" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" :body-style="{ padding: '16px' }">
          <a-statistic title="活跃用户数" :value="18" :value-style="{ fontSize: '24px' }" />
        </a-card>
      </a-col>
    </a-row>

    <!-- 日志列表 -->
    <a-card :bordered="false">
      <a-table :data="logs" :columns="columns" :pagination="{ pageSize: 12, showTotal: true }" row-key="id">
        <!-- 日志级别 -->
        <template #level="{ record }">
          <a-tag :color="levelColorMap[record.level]">{{ record.level.toUpperCase() }}</a-tag>
        </template>
        <!-- 操作结果 -->
        <template #result="{ record }">
          <a-badge
            :status="record.result === 'success' ? 'success' : 'danger'"
            :text="record.result === 'success' ? '成功' : '失败'"
          />
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Message } from "@arco-design/web-vue";

const dateRange = ref([]);
const levelFilter = ref<string | undefined>(undefined);
const moduleFilter = ref<string | undefined>(undefined);
const userKeyword = ref("");

const levelColorMap: Record<string, string> = {
  info: "blue",
  warn: "orange",
  error: "red"
};

const columns = [
  { title: "时间", dataIndex: "time", width: 170 },
  { title: "级别", dataIndex: "level", slotName: "level", width: 90 },
  { title: "操作模块", dataIndex: "module", width: 120 },
  { title: "操作描述", dataIndex: "description", ellipsis: true },
  { title: "操作用户", dataIndex: "user", width: 120 },
  { title: "客户端 IP", dataIndex: "ip", width: 140 },
  { title: "结果", dataIndex: "result", slotName: "result", width: 80 }
];

// 占位日志数据
const logs = ref([
  {
    id: "l001",
    time: "2024-12-05 10:23:14",
    level: "info",
    module: "认证授权",
    description: "用户登录系统",
    user: "admin",
    ip: "192.168.1.100",
    result: "success"
  },
  {
    id: "l002",
    time: "2024-12-05 10:18:02",
    level: "info",
    module: "资源管理",
    description: "上传问卷配置文件 survey_001.json",
    user: "editor01",
    ip: "192.168.1.105",
    result: "success"
  },
  {
    id: "l003",
    time: "2024-12-05 09:55:30",
    level: "warn",
    module: "问卷管理",
    description: "并发数超过告警阈值(>50)",
    user: "system",
    ip: "127.0.0.1",
    result: "success"
  },
  {
    id: "l004",
    time: "2024-12-05 09:40:11",
    level: "error",
    module: "Token 管理",
    description: "Token 鉴权失败，IP 被临时封禁",
    user: "unknown",
    ip: "10.0.0.23",
    result: "failure"
  },
  {
    id: "l005",
    time: "2024-12-05 09:12:45",
    level: "info",
    module: "问卷管理",
    description: "删除已归档问卷配置 survey_archive_q3.json",
    user: "admin",
    ip: "192.168.1.100",
    result: "success"
  },
  {
    id: "l006",
    time: "2024-12-05 08:30:00",
    level: "info",
    module: "认证授权",
    description: "系统定时任务开始执行",
    user: "system",
    ip: "127.0.0.1",
    result: "success"
  }
]);

const handleFilter = () => {
  // TODO: 对接日志查询接口
  Message.info("查询条件已应用");
};

const handleReset = () => {
  dateRange.value = [];
  levelFilter.value = undefined;
  moduleFilter.value = undefined;
  userKeyword.value = "";
};

const handleExport = () => {
  // TODO: 对接日志导出接口
  Message.info("日志导出功能开发中");
};
</script>

<style scoped>
.audit-page {
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

/* 筛选工具栏：水平排列，自动换行 */
.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

/* 操作按钮组：保持同行 */
.filter-actions {
  display: flex;
  align-items: center;
  white-space: nowrap;
}
</style>
