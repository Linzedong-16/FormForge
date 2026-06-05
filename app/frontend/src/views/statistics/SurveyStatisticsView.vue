<template>
  <div class="statistics-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="title-area">
        <h2 class="page-title">问卷答卷数据统计</h2>
        <p class="page-desc">图表化展示各问卷答卷数量、完成率与趋势分析</p>
      </div>
      <a-space>
        <a-range-picker v-model="dateRange" style="width: 260px" />
        <a-button type="outline" @click="handleExport">
          <template #icon><icon-download /></template>
          导出报表
        </a-button>
      </a-space>
    </div>

    <!-- 汇总统计指标 -->
    <a-row :gutter="16">
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="累计答卷总数" :value="48320">
            <template #suffix><span class="stat-unit">份</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="平均完成率" :value="78.4" :precision="1" :value-style="{ color: 'rgb(var(--green-6))' }">
            <template #suffix><span class="stat-unit">%</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="平均答题时长" :value="4.5" :precision="1">
            <template #suffix><span class="stat-unit">分钟</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="参与问卷数" :value="12">
            <template #suffix><span class="stat-unit">份</span></template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <!-- 图表区域 -->
    <a-row :gutter="16">
      <a-col :span="16">
        <a-card title="每日答卷量趋势" :bordered="false">
          <div class="chart-placeholder">
            <icon-bar-chart class="placeholder-icon" />
            <p>日答卷量折线/柱状图（集成 ECharts 后展示）</p>
          </div>
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card title="完成率分布" :bordered="false">
          <div class="chart-placeholder small">
            <icon-cloud class="placeholder-icon" />
            <p>完成率饼图（集成图表库后展示）</p>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <!-- 各问卷数据明细 -->
    <a-card title="问卷数据明细" :bordered="false">
      <a-table :data="surveyStats" :columns="columns" :pagination="{ pageSize: 8, showTotal: true }" row-key="id">
        <!-- 完成率进度条 -->
        <template #completionRate="{ record }">
          <div class="rate-cell">
            <a-progress :percent="record.completionRate / 100" :stroke-width="6" :show-text="false" animation />
            <span class="rate-text">{{ record.completionRate }}%</span>
          </div>
        </template>
        <!-- 操作 -->
        <template #operations="{ record }">
          <a-button type="text" size="small" @click="handleViewDetail(record)">查看详情</a-button>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Message } from "@arco-design/web-vue";

const dateRange = ref([]);

const columns = [
  { title: "问卷标题", dataIndex: "title", ellipsis: true },
  { title: "总答卷数", dataIndex: "totalCount", width: 110, sorter: true },
  { title: "有效答卷", dataIndex: "validCount", width: 110 },
  { title: "完成率", dataIndex: "completionRate", slotName: "completionRate", width: 200 },
  { title: "平均时长", dataIndex: "avgDuration", width: 120 },
  { title: "最近更新", dataIndex: "lastUpdated", width: 160 },
  { title: "操作", slotName: "operations", width: 100 }
];

// 占位数据
const surveyStats = ref([
  {
    id: "s001",
    title: "用户满意度调查 2024",
    totalCount: 12480,
    validCount: 11230,
    completionRate: 89,
    avgDuration: "3分42秒",
    lastUpdated: "2024-12-05 10:00"
  },
  {
    id: "s002",
    title: "产品功能需求调研",
    totalCount: 8320,
    validCount: 6890,
    completionRate: 82,
    avgDuration: "5分15秒",
    lastUpdated: "2024-12-04 18:30"
  },
  {
    id: "s003",
    title: "员工年度评估问卷",
    totalCount: 420,
    validCount: 418,
    completionRate: 99,
    avgDuration: "8分20秒",
    lastUpdated: "2024-12-03 09:00"
  },
  {
    id: "s004",
    title: "市场调研问卷 Q4",
    totalCount: 5280,
    validCount: 3620,
    completionRate: 68,
    avgDuration: "4分05秒",
    lastUpdated: "2024-11-30 15:45"
  },
  {
    id: "s005",
    title: "NPS 评分问卷",
    totalCount: 21820,
    validCount: 16340,
    completionRate: 74,
    avgDuration: "1分30秒",
    lastUpdated: "2024-12-05 08:00"
  }
]);

const handleExport = () => {
  Message.info("报表导出功能开发中");
};

const handleViewDetail = (record: { title: string }) => {
  Message.info(`查看详情：${record.title}`);
};
</script>

<style scoped>
.statistics-page {
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

/* 完成率列布局 */
.rate-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rate-text {
  font-size: 13px;
  color: var(--color-text-2);
  width: 40px;
  text-align: right;
}
</style>
