<template>
  <div class="analytics-dashboard-page">
    <AnalyticsFilterBar />
    <router-view />
  </div>
</template>

<script setup lang="ts">
/**
 * 埋点监控布局容器
 *
 * 参照问卷管理（SurveyManagementLayout.vue）的路由子菜单模式：
 * 左侧全局 Side-bar 根据 routes.ts 中 analyticsDashboard 的 children 自动渲染二级菜单，
 * 本容器只负责固定顶部筛选栏 + 承载子路由内容出口，不重复渲染导航。
 */
import AnalyticsFilterBar from "./AnalyticsFilterBar.vue";
</script>

<style scoped>
.analytics-dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
