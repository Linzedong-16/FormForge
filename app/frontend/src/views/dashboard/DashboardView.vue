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

    <!-- 系统健康 + SMTP 状态 -->
    <a-row :gutter="16" class="content-row">
      <a-col :span="16">
        <a-card title="系统健康状态" :bordered="false">
          <a-spin :loading="healthLoading" tip="检测中...">
            <div v-if="healthData" class="health-panel">
              <div class="health-summary">
                <a-tag v-if="healthData.status === 'ok'" color="green" size="large">
                  <template #icon><icon-check-circle /></template>
                  运行正常
                </a-tag>
                <a-tag v-else color="orangered" size="large">
                  <template #icon><icon-exclamation-circle /></template>
                  部分异常
                </a-tag>
                <span class="health-uptime">运行时间：{{ formatUptime(healthData.uptime) }}</span>
              </div>
              <a-row :gutter="16" class="service-checks">
                <a-col v-for="(check, name) in healthData.checks" :key="name" :span="8">
                  <div class="check-item" :class="{ 'check-fail': !check.ok }">
                    <a-badge :status="check.ok ? 'success' : 'danger'" />
                    <span class="check-name">{{ formatServiceName(name) }}</span>
                    <span v-if="check.latency_ms != null" class="check-latency">{{ check.latency_ms }}ms</span>
                    <a-tooltip v-if="check.error" :content="check.error">
                      <icon-exclamation-circle-fill class="check-error-icon" />
                    </a-tooltip>
                  </div>
                </a-col>
              </a-row>
            </div>
            <a-empty v-else description="无法获取健康状态" />
          </a-spin>
        </a-card>
      </a-col>

      <a-col :span="8">
        <a-card title="系统配置总览" :bordered="false" class="config-overview-card">
          <a-spin :loading="configLoading" tip="加载中...">
            <div v-if="configData" class="config-list">
              <div v-for="(items, category) in configData" :key="category" class="config-group">
                <div class="config-category">{{ category }}</div>
                <div v-for="(value, key) in items" :key="key" class="config-item">
                  <span class="config-key">{{ key }}</span>
                  <span class="config-value">{{ maskSensitive(key, value) }}</span>
                </div>
              </div>
            </div>
            <a-empty v-else description="超级管理员可查看系统配置" />
          </a-spin>
        </a-card>
      </a-col>
    </a-row>

    <!-- 趋势图表 + 最近操作 -->
    <a-row :gutter="16" class="content-row">
      <a-col :span="16">
        <a-card title="近 7 日答卷趋势" :bordered="false">
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
            <a-button type="primary" @click="$router.push('/system-settings')">
              <template #icon><icon-settings /></template>
              系统设置
            </a-button>
          </a-space>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useUserStore } from "@/store/modules/user";
import { getHealthStatus } from "@/api/modules/admin";
import { getAdminConfig } from "@/api/modules/admin";
import type { HealthCheckResult, SystemConfig } from "@/api/modules/admin";

const userStore = useUserStore();

// ── 健康检查 ──────────────────────────────────────────────

const healthLoading = ref(false);
const healthData = ref<HealthCheckResult | null>(null);

async function fetchHealth() {
  healthLoading.value = true;
  try {
    const res = await getHealthStatus();
    if (res.code === 0 && res.data) {
      healthData.value = res.data;
    }
  } catch {
    // 健康接口失败不阻断主流程
  } finally {
    healthLoading.value = false;
  }
}

// ── 系统配置 ──────────────────────────────────────────────

const configLoading = ref(false);
const configData = ref<SystemConfig | null>(null);

async function fetchConfig() {
  if (!userStore.isSuperAdmin) return;
  configLoading.value = true;
  try {
    const res = await getAdminConfig();
    if (res.code === 0 && res.data) {
      configData.value = res.data;
    }
  } catch {
    // 非 super_admin 不展示
  } finally {
    configLoading.value = false;
  }
}

// ── 工具 ──────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  if (h > 0) return `${h}时 ${m}分`;
  return `${m}分`;
}

function formatServiceName(name: string): string {
  const map: Record<string, string> = {
    postgres: "PostgreSQL",
    redis: "Redis",
    rabbitmq: "RabbitMQ"
  };
  return map[name] || name;
}

/** 敏感字段脱敏 */
function maskSensitive(key: string, value: string): string {
  if (!value) return "—";
  if (key.includes("password") || key.includes("secret")) {
    return value.length > 6 ? "••••••••" : "••••";
  }
  if (value.length > 40) return value.substring(0, 40) + "...";
  return value;
}

// ── 最近操作记录 ──────────────────────────────────────────

const recentLogs = [
  { id: 1, status: "success", text: "上传问卷配置 survey_001.json", time: "10分钟前" },
  { id: 2, status: "success", text: "用户 admin 登录系统", time: "25分钟前" },
  { id: 3, status: "warning", text: "并发数超过阈值警告", time: "1小时前" },
  { id: 4, status: "success", text: "新建 API Token", time: "2小时前" },
  { id: 5, status: "normal", text: "导出答卷数据报表", time: "3小时前" }
];

// ── 挂载 ──────────────────────────────────────────────────

onMounted(() => {
  fetchHealth();
  fetchConfig();
});
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

/* ── 健康面板 ──────────────────────────────────────────── */

.health-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.health-summary {
  display: flex;
  align-items: center;
  gap: 16px;
}

.health-uptime {
  font-size: 13px;
  color: var(--color-text-3);
}

.service-checks {
  margin-top: 8px;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--color-fill-1);
  border-radius: 6px;
  margin-bottom: 8px;
}

.check-fail {
  background: var(--color-danger-light-1);
}

.check-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-1);
  flex: 1;
}

.check-latency {
  font-size: 12px;
  color: var(--color-text-3);
}

.check-error-icon {
  color: rgb(var(--red-6));
  font-size: 16px;
  cursor: pointer;
}

/* ── 配置总览 ──────────────────────────────────────────── */

.config-overview-card {
  min-height: 200px;
}

.config-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-category {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-3);
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: 13px;
}

.config-key {
  color: var(--color-text-2);
  font-family: "SF Mono", "Monaco", "Consolas", monospace;
  font-size: 12px;
}

.config-value {
  color: var(--color-text-1);
  max-width: 180px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 图表占位区域 ───────────────────────────────────────── */

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

/* ── 操作记录 ──────────────────────────────────────────── */

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
