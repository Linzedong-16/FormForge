<template>
  <div class="analytics-filter-bar">
    <div class="page-header">
      <div class="title-area">
        <h2 class="page-title">埋点监控</h2>
        <p class="page-desc">汇总编辑器、后台等应用上报的错误、性能与用量数据</p>
      </div>
      <a-tag :color="environmentTagColor" size="large">当前环境：{{ environmentLabel }}</a-tag>
    </div>

    <!-- 筛选栏：时间范围 / 应用 / 环境，联动除概览、实时快照、漏斗、管道健康以外的各模块 -->
    <a-card :bordered="false" :body-style="{ padding: '16px' }">
      <div class="filter-toolbar">
        <a-radio-group v-model="filters.range" type="button">
          <a-radio value="1h">近 1 小时</a-radio>
          <a-radio value="6h">近 6 小时</a-radio>
          <a-radio value="24h">近 24 小时</a-radio>
          <a-radio value="7d">近 7 天</a-radio>
          <a-radio value="30d">近 30 天</a-radio>
          <a-radio value="90d">近 90 天</a-radio>
        </a-radio-group>
        <a-select v-model="filters.appId" placeholder="不限应用" style="width: 160px" allow-clear>
          <a-option value="q-editor">q-editor（编辑器）</a-option>
          <a-option value="frontend">frontend（管理后台）</a-option>
          <a-option value="main-app">main-app（主应用）</a-option>
          <a-option value="q-server">q-server（后端）</a-option>
          <a-option value="ai-service">ai-service（AI 服务）</a-option>
        </a-select>
        <a-select v-model="filters.environment" style="width: 140px">
          <a-option value="production">生产环境</a-option>
          <a-option value="staging">预发布环境</a-option>
          <a-option value="development">开发环境</a-option>
        </a-select>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 埋点监控 —— 顶部标题 + 筛选栏组件
 *
 * 从原单页面版本抽离，常驻在 AnalyticsDashboardLayout.vue 顶部，
 * 不随子路由（概览/管道健康/错误性能/用量与漏斗）切换而重新挂载，
 * 筛选状态通过 useAnalyticsFilters 单例在各模块间共享联动。
 */
import { computed } from "vue";
import { useAnalyticsFilters } from "@/composables/useAnalyticsFilters";
import type { Environment } from "@/api/modules/analytics";

const { filters } = useAnalyticsFilters();

const environmentLabel = computed(() => {
  const map: Record<Environment, string> = {
    production: "生产环境",
    staging: "预发布环境",
    development: "开发环境"
  };
  return map[filters.environment];
});

const environmentTagColor = computed(() => (filters.environment === "production" ? "green" : "orange"));
</script>

<style scoped>
.analytics-filter-bar {
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

.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
</style>
