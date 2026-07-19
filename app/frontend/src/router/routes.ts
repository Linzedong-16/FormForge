import type { RouteRecordRaw } from "vue-router";

export interface RouteMeta {
  title: string; // 路由标题
  icon: string; // 路由图标（对应 acro-icons 中的 key）
  /** 是否仅 super_admin 角色可访问（前端路由守卫层的 UX 提前拦截，后端接口鉴权仍是权威判定） */
  requiresSuperAdmin?: boolean;
}

/**
 * 问卷低代码平台后台管理系统业务路由
 *
 * 导航结构设计原则：
 *   平台概览 → 并发监控 → 核心业务（问卷管理）→ 数据洞察（埋点监控）
 *   → 系统管理（用户 → 消息 → 日志 → Token → 设置）
 *
 * 已移除的无真实接口页面：配置资源管理（纯 mock）、角色管理（纯 mock）、权限设置（纯 mock）
 */
export const childrenRoutes: RouteRecordRaw[] = [
  // ═══════════════════════════════════════════════════════════
  // 1. 平台概览 — 入口仪表盘，展示关键指标与系统状态
  // ═══════════════════════════════════════════════════════════
  {
    path: "",
    name: "dashboard",
    component: () => import("../views/dashboard/DashboardView.vue"),
    meta: {
      title: "平台概览",
      icon: "dashboard"
    }
  },

  // ═══════════════════════════════════════════════════════════
  // 2. 并发监控 — 实时答卷并发与系统负载状态
  // ═══════════════════════════════════════════════════════════
  {
    path: "/monitor",
    name: "monitor",
    component: () => import("../views/monitor/SurveyMonitorView.vue"),
    meta: {
      title: "并发监控",
      icon: "barChart"
    }
  },

  // ═══════════════════════════════════════════════════════════
  // 3. 问卷管理 — 核心业务：审核、发布、统计
  // ═══════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════
  // 4. 埋点监控 — 全链路数据洞察（仅超级管理员）
  // ═══════════════════════════════════════════════════════════
  {
    path: "/analytics-dashboard",
    name: "analyticsDashboard",
    component: () => import("../views/analytics-dashboard/AnalyticsDashboardLayout.vue"),
    meta: {
      title: "埋点监控",
      icon: "barChart",
      requiresSuperAdmin: true
    },
    children: [
      {
        path: "",
        name: "analyticsOverview",
        component: () => import("../views/analytics-dashboard/OverviewView.vue"),
        meta: { title: "概览", icon: "dashboard" }
      },
      {
        path: "pipeline-health",
        name: "analyticsPipelineHealth",
        component: () => import("../views/analytics-dashboard/PipelineHealthView.vue"),
        meta: { title: "管道健康", icon: "thunderbolt" }
      },
      {
        path: "errors-performance",
        name: "analyticsErrorsPerformance",
        component: () => import("../views/analytics-dashboard/ErrorsPerformanceView.vue"),
        meta: { title: "错误性能", icon: "bug" }
      },
      {
        path: "usage-funnel",
        name: "analyticsUsageFunnel",
        component: () => import("../views/analytics-dashboard/UsageFunnelView.vue"),
        meta: { title: "用量与漏斗", icon: "barChart" }
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // 5. 用户管理 — 用户列表 CRUD（角色/权限 mock 页面已移除）
  // ═══════════════════════════════════════════════════════════
  {
    path: "/user-management",
    name: "userManagement",
    component: () => import("../views/user-management/UserListView.vue"),
    meta: {
      title: "用户管理",
      icon: "userGroup"
    }
  },

  // ═══════════════════════════════════════════════════════════
  // 6. 消息中心 — 广播发布与历史（仅超级管理员）
  // ═══════════════════════════════════════════════════════════
  {
    path: "/message-center",
    name: "messageCenter",
    component: () => import("../views/message-center/MessageCenterLayout.vue"),
    meta: {
      title: "消息中心",
      icon: "notification",
      requiresSuperAdmin: true
    },
    children: [
      {
        path: "broadcast",
        name: "broadcastSent",
        component: () => import("../views/message-center/BroadcastSentView.vue"),
        meta: { title: "已发送广播", icon: "send" }
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // 7. 日志审计 — 系统操作日志与审计追溯
  // ═══════════════════════════════════════════════════════════
  {
    path: "/audit-logs",
    name: "auditLogs",
    component: () => import("../views/audit-logs/AuditLogsView.vue"),
    meta: {
      title: "日志审计",
      icon: "history"
    }
  },

  // ═══════════════════════════════════════════════════════════
  // 8. API Token 管理 — 第三方接入凭证管理
  // ═══════════════════════════════════════════════════════════
  {
    path: "/api-tokens",
    name: "apiTokens",
    component: () => import("../views/api-tokens/ApiTokensView.vue"),
    meta: {
      title: "API Token 管理",
      icon: "lock"
    }
  },

  // ═══════════════════════════════════════════════════════════
  // 9. 系统设置 — SMTP、AI 服务等全局配置
  // ═══════════════════════════════════════════════════════════
  {
    path: "/system-settings",
    name: "systemSettings",
    component: () => import("../views/settings/SystemSettingsView.vue"),
    meta: {
      title: "系统设置",
      icon: "settings"
    }
  },

  // ═══════════════════════════════════════════════════════════
  // 10. 物料管理 — 全平台图片资源统一管理（仅超级管理员）
  // ═══════════════════════════════════════════════════════════
  {
    path: "/media-assets",
    name: "mediaAssetManagement",
    component: () => import("../views/media-asset-management/MediaAssetManagementView.vue"),
    meta: {
      title: "物料管理",
      icon: "image",
      requiresSuperAdmin: true
    }
  }
];
