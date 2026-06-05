<template>
  <div class="monitor-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="title-area">
        <h2 class="page-title">在线问卷并发监控</h2>
        <p class="page-desc">实时监控问卷并发提交情况与服务器压力</p>
      </div>
      <a-space>
        <a-tag :color="isRunning ? 'green' : 'gray'">
          {{ isRunning ? "● 监控运行中" : "○ 已暂停" }}
        </a-tag>
        <a-button type="outline" @click="toggleMonitor">
          {{ isRunning ? "暂停监控" : "启动监控" }}
        </a-button>
        <a-button @click="refreshData">
          <template #icon><icon-refresh /></template>
          刷新
        </a-button>
      </a-space>
    </div>

    <!-- 实时并发核心指标 -->
    <a-row :gutter="16" class="realtime-stats">
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic
            title="当前并发在线"
            :value="realtimeStats.concurrent"
            :value-style="{ color: 'rgb(var(--arcoblue-6))', fontSize: '36px' }"
          >
            <template #suffix><span class="stat-unit">人</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic
            title="每分钟提交量"
            :value="realtimeStats.submitsPerMin"
            :value-style="{ color: 'rgb(var(--green-6))', fontSize: '36px' }"
          >
            <template #suffix><span class="stat-unit">次/min</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic
            title="活跃问卷数"
            :value="realtimeStats.activeSurveys"
            :value-style="{ color: 'rgb(var(--orangered-6))', fontSize: '36px' }"
          >
            <template #suffix><span class="stat-unit">份</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic
            title="服务器响应时长"
            :value="realtimeStats.avgResponseMs"
            :value-style="{ color: 'rgb(var(--purple-6))', fontSize: '36px' }"
          >
            <template #suffix><span class="stat-unit">ms</span></template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <!-- 并发趋势图 -->
    <a-row :gutter="16" class="chart-row">
      <a-col :span="16">
        <a-card title="并发数趋势（近60分钟）" :bordered="false">
          <!-- 接入 ECharts 折线图后替换此占位 -->
          <div class="chart-placeholder">
            <icon-bar-chart class="placeholder-icon" />
            <p>实时并发折线图（集成图表库后展示）</p>
          </div>
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card title="问卷并发分布" :bordered="false">
          <!-- 接入 ECharts 环形图后替换此占位 -->
          <div class="chart-placeholder small">
            <icon-dashboard class="placeholder-icon" />
            <p>环形分布图（集成图表库后展示）</p>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <!-- 实时连接列表 -->
    <a-card title="活跃问卷连接列表" :bordered="false">
      <a-table
        :data="connectionList"
        :columns="columns"
        :pagination="{ pageSize: 8, showTotal: true }"
        row-key="id"
        size="small"
      >
        <template #status="{ record }">
          <a-badge :status="record.status === '答题中' ? 'processing' : 'normal'" :text="record.status" />
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const isRunning = ref(true);

// 实时统计数据（占位，实际应通过 WebSocket 或定时轮询更新）
const realtimeStats = ref({
  concurrent: 43,
  submitsPerMin: 12,
  activeSurveys: 8,
  avgResponseMs: 126
});

// 连接列表列定义
const columns = [
  { title: "连接 ID", dataIndex: "id", width: 120 },
  { title: "问卷标题", dataIndex: "surveyTitle" },
  { title: "用户来源", dataIndex: "source", width: 120 },
  { title: "连接时长", dataIndex: "duration", width: 120 },
  { title: "状态", dataIndex: "status", slotName: "status", width: 100 }
];

// 占位数据
const connectionList = ref([
  { id: "c-001", surveyTitle: "用户满意度调查 2024", source: "Chrome/Windows", duration: "2分15秒", status: "答题中" },
  { id: "c-002", surveyTitle: "产品功能需求调研", source: "Safari/iOS", duration: "4分32秒", status: "答题中" },
  { id: "c-003", surveyTitle: "员工年度评估问卷", source: "Firefox/macOS", duration: "1分05秒", status: "已提交" },
  { id: "c-004", surveyTitle: "用户满意度调查 2024", source: "Chrome/Android", duration: "0分48秒", status: "答题中" },
  { id: "c-005", surveyTitle: "市场调研问卷 Q4", source: "Edge/Windows", duration: "3分21秒", status: "答题中" }
]);

const toggleMonitor = () => {
  isRunning.value = !isRunning.value;
};

const refreshData = () => {
  // TODO: 对接实时数据接口
};
</script>

<style scoped>
.monitor-page {
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

.stat-unit {
  font-size: 13px;
  color: var(--color-text-3);
  margin-left: 4px;
}

.chart-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 220px;
  color: var(--color-text-4);
  font-size: 14px;
}

.chart-placeholder.small {
  height: 200px;
}

.placeholder-icon {
  font-size: 48px;
  color: var(--color-fill-3);
  margin-bottom: 12px;
}
</style>
