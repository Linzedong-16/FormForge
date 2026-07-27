<template>
  <div class="dashboard">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">平台概览</h2>
      <p class="page-desc">问卷低代码平台运营数据汇总</p>
    </div>

    <!-- 核心指标卡片（对接后端统计数据） -->
    <a-row :gutter="16" class="stats-row">
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="问卷总数" :value="statsCards[0].value" :value-style="{ color: 'rgb(var(--arcoblue-6))' }">
            <template #suffix><span class="stat-unit">份</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="今日答卷" :value="statsCards[1].value" :value-style="{ color: 'rgb(var(--green-6))' }">
            <template #suffix><span class="stat-unit">份</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic
            title="累计答卷"
            :value="statsCards[2].value"
            :value-style="{ color: 'rgb(var(--orangered-6))' }"
          >
            <template #suffix><span class="stat-unit">份</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic
            title="本月 AI Token 用量"
            :value="statsCards[3].value"
            :value-style="{ color: 'rgb(var(--purple-6))' }"
          >
            <template #suffix><span class="stat-unit">tokens</span></template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <!-- 系统健康 + 系统配置（同一行，左右对齐） -->
    <a-row :gutter="16" class="content-row">
      <a-col :span="14">
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

      <a-col :span="10">
        <a-card title="系统配置总览" :bordered="false">
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
            <a-empty v-else description="仅超级管理员可见" />
          </a-spin>
        </a-card>
      </a-col>
    </a-row>

    <!-- 答卷趋势 + 审计日志 -->
    <a-row :gutter="16" class="content-row">
      <a-col :span="16">
        <a-card title="近 7 日答卷趋势" :bordered="false" :loading="statsLoading" class="trend-card">
          <div v-if="trendBars.length > 0" class="trend-chart">
            <div v-for="bar in trendBars" :key="bar.date" class="trend-bar-row">
              <span class="trend-date">{{ bar.date }}</span>
              <div class="trend-bar-track">
                <div class="trend-bar-fill" :style="{ width: bar.pct + '%' }"></div>
              </div>
              <span class="trend-count">{{ bar.count }}</span>
            </div>
          </div>
          <a-empty v-else description="暂无答卷数据" />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card title="最近操作记录" :bordered="false" class="log-card" :loading="logsLoading">
          <div v-if="recentLogs.length > 0" class="log-scroll">
            <a-list :bordered="false" size="small">
              <a-list-item v-for="item in recentLogs" :key="item.id">
                <div class="log-item">
                  <a-badge :status="item.ok ? 'success' : 'danger'" />
                  <span class="log-text">{{ item.action }}</span>
                </div>
                <span class="log-time">{{ item.time }}</span>
              </a-list-item>
            </a-list>
          </div>
          <a-empty v-else description="暂无操作记录" />
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
            <a-button type="outline" @click="$router.push('/survey-management/statistics')">
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
import { getHealthStatus, getAdminConfig } from "@/api/modules/admin";
import { getStatsOverview } from "@/api/modules/survey";
import { getAIUsage } from "@/api/modules/admin";
import { getAuditLogList } from "@/api/modules/log";
import type { HealthCheckResult, SystemConfig } from "@/api/modules/admin";

const userStore = useUserStore();

// ── 统计指标卡片 ──────────────────────────────────────────

const statsCards = ref([{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }]);

// ── 7 日趋势 ──────────────────────────────────────────────

const statsLoading = ref(false);
const trendBars = ref<Array<{ date: string; count: number; pct: number }>>([]);

async function fetchStats() {
  statsLoading.value = true;
  try {
    const [overviewRes, aiUsageRes] = await Promise.allSettled([getStatsOverview(), getAIUsage()]);

    if (overviewRes.status === "fulfilled" && overviewRes.value.code === 0 && overviewRes.value.data) {
      const d = overviewRes.value.data;
      statsCards.value[0].value = d.total_surveys;
      statsCards.value[1].value = d.responses_today;
      statsCards.value[2].value = d.total_responses;

      if (d.trend_7_days?.length) {
        const max = Math.max(...d.trend_7_days.map(t => t.count), 1);
        trendBars.value = d.trend_7_days.map(t => ({
          date: t.date.slice(5),
          count: t.count,
          pct: Math.round((t.count / max) * 100)
        }));
      }
    }

    if (aiUsageRes.status === "fulfilled" && aiUsageRes.value.code === 0 && aiUsageRes.value.data) {
      statsCards.value[3].value = aiUsageRes.value.data.usage_summary.total_tokens;
    }
  } catch {
    // 非阻塞
  } finally {
    statsLoading.value = false;
  }
}

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

// ── 审计日志 ──────────────────────────────────────────────

const logsLoading = ref(false);
const recentLogs = ref<Array<{ id: string; action: string; time: string; ok: boolean }>>([]);

async function fetchLogs() {
  logsLoading.value = true;
  try {
    const res = await getAuditLogList({ page: 1, pageSize: 8 });
    if (res.code === 0 && res.data?.items) {
      recentLogs.value = res.data.items.map((item: { id: string; action: string; time: string }) => ({
        id: item.id,
        action: formatAction(item.action),
        time: formatRelativeTime(item.time),
        ok: true
      }));
    }
  } catch {
    // 非阻塞
  } finally {
    logsLoading.value = false;
  }
}

/** 操作类型 → 可读中文 */
function formatAction(action: string): string {
  const map: Record<string, string> = {
    login: "用户登录系统",
    create_survey: "创建问卷",
    update_survey: "更新问卷",
    delete_survey: "删除问卷",
    publish_survey: "发布问卷",
    submit_response: "提交答卷",
    generate_survey_link: "生成问卷链接",
    submit_review: "提交审核",
    update_smtp_config: "更新 SMTP 配置",
    update_ai_config: "更新 AI 配置",
    create_user: "创建用户",
    delete_user: "删除用户",
    ban_user: "封禁用户",
    unban_user: "解封用户"
  };
  return map[action] ?? action;
}

/** ISO 时间 → "x分钟前" / "x小时前" */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return min <= 0 ? "刚刚" : `${min}分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}小时前`;
  return `${Math.floor(hour / 24)}天前`;
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
    rabbitmq: "RabbitMQ",
    minio: "MinIO",
    mongodb: "MongoDB",
    clickhouse: "ClickHouse"
  };
  return map[name] || name;
}

/** 敏感字段脱敏 + 超长截断 */
function maskSensitive(key: string, value: string): string {
  if (!value) return "—";
  if (key.includes("password") || key.includes("secret") || key.includes("api_key") || key.includes("token")) {
    if (value.includes("****")) return value;
    return value.length > 8 ? "••••••••" : "••••";
  }
  if (value.length > 28) return value.substring(0, 28) + "…";
  return value;
}

// ── 挂载 ──────────────────────────────────────────────────

onMounted(() => {
  fetchStats();
  fetchHealth();
  fetchConfig();
  fetchLogs();
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
  box-shadow: var(--shadow-md);
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
  border-radius: var(--radius-sm);
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

/* ── 趋势 + 日志卡片等高 ────────────────────────────────── */

.trend-card .trend-chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.trend-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trend-date {
  width: 42px;
  font-size: 12px;
  color: var(--color-text-3);
  text-align: right;
}

.trend-bar-track {
  flex: 1;
  height: 16px;
  background: var(--color-fill-3);
  border-radius: 3px;
  overflow: hidden;
}

.trend-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, rgb(var(--primary-5)), rgb(var(--primary-6)));
  border-radius: 3px;
  min-width: 2px;
}

.trend-count {
  width: 44px;
  font-size: 12px;
  color: var(--color-text-3);
  text-align: right;
}

/* ── 最近操作滚动容器 ──────────────────────────────────── */

.log-scroll {
  max-height: 196px;
  overflow-y: auto;
  scrollbar-width: thin;
}

/* ── 操作记录 ──────────────────────────────────────────── */

.config-group {
  flex: 1 1 360px;
  min-width: 320px;
}

.config-category {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-3);
  letter-spacing: 0.8px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-fill-3);
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 10px;
  font-size: 13px;
  border-radius: var(--radius-xs);
  transition: background 0.15s;
}

.config-item:nth-child(odd) {
  background: var(--color-fill-1);
}

.config-item:hover {
  background: var(--color-fill-2);
}

.config-key {
  color: var(--color-text-2);
  font-family: "SF Mono", "Monaco", "Consolas", monospace;
  font-size: 11px;
  flex-shrink: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
  margin-right: 16px;
}

.config-value {
  color: var(--color-text-1);
  flex-shrink: 1;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  line-height: 1.5;
  min-width: 0;
  margin-left: auto;
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
