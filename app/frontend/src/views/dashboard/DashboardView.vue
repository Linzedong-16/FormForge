<template>
  <div class="dashboard">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">平台概览</h2>
      <p class="page-desc">问卷低代码平台运营数据汇总</p>
    </div>

    <!-- 核心指标卡片 -->
    <a-row :gutter="16" class="stats-row">
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="问卷总数" :value="128" :value-style="{ color: 'rgb(var(--arcoblue-6))' }">
            <template #suffix><span class="stat-unit">份</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="今日填写次数" :value="2346" :value-style="{ color: 'rgb(var(--green-6))' }">
            <template #suffix><span class="stat-unit">次</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="当前在线并发" :value="43" :value-style="{ color: 'rgb(var(--orangered-6))' }">
            <template #suffix><span class="stat-unit">人</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="Token 月使用量" :value="18920" :value-style="{ color: 'rgb(var(--purple-6))' }">
            <template #suffix><span class="stat-unit">次</span></template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <!-- 趋势图表 + 最近操作 -->
    <a-row :gutter="16" class="content-row">
      <a-col :span="16">
        <a-card title="近 7 日答卷趋势" :bordered="false">
          <!-- 图表占位区域，集成 ECharts/Chart.js 后替换 -->
          <div class="chart-placeholder">
            <icon-bar-chart class="placeholder-icon" />
            <p>折线图表（接入图表库后展示）</p>
          </div>
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card title="最近操作记录" :bordered="false" class="log-card">
          <a-list :bordered="false" size="small">
            <a-list-item v-for="item in recentLogs" :key="item.id">
              <div class="log-item">
                <a-badge :status="item.status as any" />
                <span class="log-text">{{ item.text }}</span>
              </div>
              <span class="log-time">{{ item.time }}</span>
            </a-list-item>
          </a-list>
        </a-card>
      </a-col>
    </a-row>

    <!-- 快捷入口 -->
    <a-row :gutter="16" class="quick-row">
      <a-col :span="24">
        <a-card title="快捷入口" :bordered="false">
          <a-space size="medium">
            <a-button type="outline" @click="$router.push('/monitor')">
              <template #icon><icon-bar-chart /></template>
              并发监控
            </a-button>
            <a-button type="outline" @click="$router.push('/survey-resources')">
              <template #icon><icon-folder /></template>
              配置资源
            </a-button>
            <a-button type="outline" @click="$router.push('/audit-logs')">
              <template #icon><icon-history /></template>
              日志审计
            </a-button>
            <a-button type="outline" @click="$router.push('/statistics')">
              <template #icon><icon-cloud /></template>
              答卷统计
            </a-button>
            <a-button type="outline" @click="$router.push('/api-tokens')">
              <template #icon><icon-lock /></template>
              Token 管理
            </a-button>
          </a-space>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
// 最近操作记录（占位数据，对接接口后替换）
const recentLogs = [
  { id: 1, status: "success", text: "上传问卷配置 survey_001.json", time: "10分钟前" },
  { id: 2, status: "success", text: "用户 admin 登录系统", time: "25分钟前" },
  { id: 3, status: "warning", text: "并发数超过阈值警告", time: "1小时前" },
  { id: 4, status: "success", text: "新建 API Token", time: "2小时前" },
  { id: 5, status: "normal", text: "导出答卷数据报表", time: "3小时前" }
];
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  font-size: 14px;
  color: var(--color-text-3);
}

.stat-card {
  transition: box-shadow 0.2s;
}

.stat-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.stat-unit {
  font-size: 14px;
  color: var(--color-text-3);
  margin-left: 4px;
}

/* 图表占位区域 */
.chart-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 220px;
  color: var(--color-text-4);
  font-size: 14px;
}

.placeholder-icon {
  font-size: 48px;
  color: var(--color-fill-3);
  margin-bottom: 12px;
}

/* 操作记录 */
.log-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.log-text {
  font-size: 13px;
  color: var(--color-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.log-time {
  font-size: 12px;
  color: var(--color-text-4);
  white-space: nowrap;
}
</style>
