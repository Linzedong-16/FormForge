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
    path: "/api-tokens",
    name: "apiTokens",
    component: () => import("../views/api-tokens/ApiTokensView.vue"),
    meta: {
      title: "API Token 管理",
      icon: "lock"
    }
  },
  {
    path: "/survey-management",
    name: "surveyManagement",
    component: () => import("../views/survey-management/SurveyManagementLayout.vue"),
    meta: {
      title: "问卷管理",
      icon: "file"
    },
    children: [
      {
        path: "audit",
        name: "surveyAudit",
        component: () => import("../views/survey-preview/SurveyPreviewView.vue"),
        meta: { title: "审核管理", icon: "safe" }
      },
      {
        path: "publish",
        name: "surveyPublish",
        component: () => import("../views/survey-publish/SurveyPublishView.vue"),
        meta: { title: "问卷发布", icon: "send" }
      },
      {
        path: "statistics",
        name: "surveyStatistics",
        component: () => import("../views/statistics/SurveyStatisticsView.vue"),
        meta: { title: "答卷统计", icon: "cloud" }
      }
    ]
  },
  {
    path: "/system-settings",
    name: "systemSettings",
    component: () => import("../views/settings/SystemSettingsView.vue"),
    meta: {
      title: "系统设置",
      icon: "settings"
    }
  },
  {
    path: "/user-management",
    name: "userManagement",
    component: () => import("../views/user-management/UserManagementLayout.vue"),
    meta: {
      title: "用户管理",
      icon: "userGroup"
    },
    children: [
      {
        path: "",
        name: "userList",
        component: () => import("../views/user-management/UserListView.vue"),
        meta: { title: "用户列表", icon: "list" }
      },
      {
        path: "roles",
        name: "roleMgmt",
        component: () => import("../views/user-management/RoleManagementView.vue"),
        meta: { title: "角色管理", icon: "user" }
      },
      {
        path: "permissions",
        name: "permissions",
        component: () => import("../views/user-management/PermissionView.vue"),
        meta: { title: "权限设置", icon: "safe" }
      }
    ]
  }
];
