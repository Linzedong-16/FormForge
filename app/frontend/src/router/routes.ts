import type { RouteRecordRaw } from "vue-router";

export interface RouteMeta {
  title: string; // 路由标题
  icon: string; // 路由图标（对应 acro-icons 中的 key）
}

// 问卷低代码平台后台管理系统业务路由
export const childrenRoutes: RouteRecordRaw[] = [
  {
    path: "",
    name: "dashboard",
    component: () => import("../views/dashboard/DashboardView.vue"),
    meta: {
      title: "平台概览",
      icon: "dashboard"
    }
  },
  {
    path: "/monitor",
    name: "monitor",
    component: () => import("../views/monitor/SurveyMonitorView.vue"),
    meta: {
      title: "并发监控",
      icon: "barChart"
    }
  },
  {
    path: "/survey-resources",
    name: "surveyResources",
    component: () => import("../views/survey-resources/SurveyResourcesView.vue"),
    meta: {
      title: "配置资源管理",
      icon: "folderOpen"
    }
  },
  {
    path: "/audit-logs",
    name: "auditLogs",
    component: () => import("../views/audit-logs/AuditLogsView.vue"),
    meta: {
      title: "日志审计",
      icon: "history"
    }
  },
  {
    path: "/statistics",
    name: "statistics",
    component: () => import("../views/statistics/SurveyStatisticsView.vue"),
    meta: {
      title: "答卷统计",
      icon: "cloud"
    }
  },
  {
    path: "/api-tokens",
    name: "apiTokens",
    component: () => import("../views/api-tokens/ApiTokensView.vue"),
    meta: {
      title: "API Token 管理",
      icon: "lock"
    }
  }
];
