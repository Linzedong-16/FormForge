<template>
  <div class="audit-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="title-area">
        <h2 class="page-title">系统日志审计</h2>
        <p class="page-desc">记录系统操作行为，追踪用户操作与安全事件</p>
      </div>
      <a-button type="outline" @click="handleExport">
        <template #icon><icon-download /></template>
        导出日志
      </a-button>
    </div>

    <!-- 日志类型切换 -->
    <a-tabs v-model:active-key="activeTab" @change="handleTabChange">
      <a-tab-pane key="system" title="系统日志" />
      <a-tab-pane key="audit" title="审计日志" />
    </a-tabs>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- 系统日志 tab -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'system'">
      <!-- 筛选工具栏 -->
      <a-card :bordered="false" :body-style="{ padding: '16px' }">
        <div class="filter-toolbar">
          <a-range-picker v-model="dateRange" style="width: 280px" show-time value-format="timestamp" />
          <a-select v-model="levelFilter" placeholder="日志级别" style="width: 130px" allow-clear>
            <a-option value="trace">TRACE</a-option>
            <a-option value="debug">DEBUG</a-option>
            <a-option value="info">INFO</a-option>
            <a-option value="warn">WARN</a-option>
            <a-option value="error">ERROR</a-option>
            <a-option value="fatal">FATAL</a-option>
          </a-select>
          <a-select v-model="sourceFilter" placeholder="服务来源" style="width: 150px" allow-clear>
            <a-option value="q-server">q-server</a-option>
          </a-select>
          <a-input-search
            v-model="keywordFilter"
            placeholder="搜索关键词"
            style="width: 180px"
            allow-clear
            @search="handleFilter"
          />
          <div class="filter-actions">
            <a-button type="primary" @click="handleFilter">查询</a-button>
            <a-button style="margin-left: 8px" @click="handleReset">重置</a-button>
          </div>
        </div>
      </a-card>

      <!-- 系统日志统计 -->
      <a-row :gutter="12">
        <a-col :span="6">
          <a-card :bordered="false" :body-style="{ padding: '16px' }">
            <a-statistic title="今日日志总数" :value="stats.todayTotal" :value-style="{ fontSize: '24px' }" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card :bordered="false" :body-style="{ padding: '16px' }">
            <a-statistic
              title="警告日志"
              :value="stats.warnCount"
              :value-style="{ fontSize: '24px', color: 'rgb(var(--orange-6))' }"
            />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card :bordered="false" :body-style="{ padding: '16px' }">
            <a-statistic
              title="错误日志"
              :value="stats.errorCount"
              :value-style="{ fontSize: '24px', color: 'rgb(var(--red-6))' }"
            />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card :bordered="false" :body-style="{ padding: '16px' }">
            <a-statistic title="活跃用户数" :value="stats.activeUsers" :value-style="{ fontSize: '24px' }" />
          </a-card>
        </a-col>
      </a-row>

      <!-- 系统日志列表 -->
      <a-card :bordered="false">
        <a-table
          :data="logs"
          :columns="systemColumns"
          :pagination="pagination"
          :loading="loading"
          row-key="id"
          @page-change="handlePageChange"
          @page-size-change="handlePageSizeChange"
        >
          <template #level="{ record }">
            <a-tag :color="levelColorMap[record.level] || 'gray'">
              {{ record.level.toUpperCase() }}
            </a-tag>
          </template>
          <template #result="{ record }">
            <a-badge
              :status="record.result === 'success' ? 'success' : 'danger'"
              :text="record.result === 'success' ? '成功' : '失败'"
            />
          </template>
          <template #time="{ record }">
            {{ formatTime(record.time) }}
          </template>
        </a-table>
      </a-card>
    </template>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- 审计日志 tab -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'audit'">
      <!-- 审计日志筛选工具栏 -->
      <a-card :bordered="false" :body-style="{ padding: '16px' }">
        <div class="filter-toolbar">
          <a-range-picker v-model="auditDateRange" style="width: 280px" show-time value-format="timestamp" />
          <a-select v-model="auditActionFilter" placeholder="操作类型" style="width: 150px" allow-clear>
            <a-option value="login">登录</a-option>
            <a-option value="create_user">创建用户</a-option>
            <a-option value="update_user">更新用户</a-option>
            <a-option value="delete_user">删除用户</a-option>
            <a-option value="create_survey">创建问卷</a-option>
            <a-option value="update_survey">更新问卷</a-option>
            <a-option value="delete_survey">删除问卷</a-option>
            <a-option value="update_smtp_config">SMTP配置</a-option>
            <a-option value="update_ai_config">AI配置</a-option>
          </a-select>
          <a-select v-model="auditResourceTypeFilter" placeholder="资源类型" style="width: 150px" allow-clear>
            <a-option value="user">用户</a-option>
            <a-option value="survey">问卷</a-option>
            <a-option value="system_config">系统配置</a-option>
            <a-option value="ai_config">AI配置</a-option>
          </a-select>
          <a-input v-model="auditUserFilter" placeholder="操作者ID" style="width: 140px" allow-clear />
          <div class="filter-actions">
            <a-button type="primary" @click="handleAuditFilter">查询</a-button>
            <a-button style="margin-left: 8px" @click="handleAuditReset">重置</a-button>
          </div>
        </div>
      </a-card>

      <!-- 审计日志统计 -->
      <a-row :gutter="12">
        <a-col :span="8">
          <a-card :bordered="false" :body-style="{ padding: '16px' }">
            <a-statistic title="今日审计日志总数" :value="auditStats.todayTotal" :value-style="{ fontSize: '24px' }" />
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card :bordered="false" :body-style="{ padding: '16px' }">
            <a-statistic title="活跃操作者数" :value="auditStats.activeUsers" :value-style="{ fontSize: '24px' }" />
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card :bordered="false" :body-style="{ padding: '16px' }">
            <a-statistic
              title="操作类型数"
              :value="actionTypeCount"
              :value-style="{ fontSize: '24px', color: 'rgb(var(--primary-6))' }"
            />
          </a-card>
        </a-col>
      </a-row>

      <!-- 审计日志列表 -->
      <a-card :bordered="false">
        <a-table
          :data="auditLogs"
          :columns="auditColumns"
          :pagination="auditPagination"
          :loading="auditLoading"
          row-key="id"
          @page-change="handleAuditPageChange"
          @page-size-change="handleAuditPageSizeChange"
        >
          <template #time="{ record }">
            {{ formatTime(record.time) }}
          </template>
          <template #details="{ record }">
            <a-popover v-if="record.details" trigger="click" :content-style="{ maxWidth: '400px' }">
              <a-button type="text" size="small">查看详情</a-button>
              <template #content>
                <pre class="detail-json">{{ JSON.stringify(record.details, null, 2) }}</pre>
              </template>
            </a-popover>
            <span v-else class="text-muted">-</span>
          </template>
        </a-table>
      </a-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { Message } from "@arco-design/web-vue";
import { getLogList, getLogStats, getAuditLogList, getAuditLogStats } from "@/api/modules/log";
import type { LogQueryParams, LogEntryItem, AuditLogEntryItem } from "@/api/modules/log";

// ─── 通用 ────────────────────────────────────────────────────

const activeTab = ref("system");

function handleTabChange(key: string | number) {
  if (key === "system") {
    loadLogs();
    loadStats();
  } else {
    loadAuditLogs();
    loadAuditStats();
  }
}

// ══════════════════════════════════════════════════════════════
//  系统日志
// ══════════════════════════════════════════════════════════════

const dateRange = ref<(number | Date | string)[]>([]);
const levelFilter = ref<string | undefined>(undefined);
const sourceFilter = ref<string | undefined>(undefined);
const keywordFilter = ref("");

const loading = ref(false);
const logs = ref<LogEntryItem[]>([]);
const currentPage = ref(1);
const currentPageSize = ref(12);

const stats = reactive({
  todayTotal: 0,
  warnCount: 0,
  errorCount: 0,
  activeUsers: 0
});

const levelColorMap: Record<string, string> = {
  trace: "gray",
  debug: "cyan",
  info: "blue",
  warn: "orange",
  error: "red",
  fatal: "magenta"
};

const pagination = reactive({
  current: 1,
  pageSize: 12,
  total: 0,
  showTotal: true,
  showPageSize: true,
  pageSizeOptions: [12, 20, 50, 100]
});

const systemColumns = [
  { title: "时间", dataIndex: "time", slotName: "time", width: 180 },
  { title: "级别", dataIndex: "level", slotName: "level", width: 90 },
  { title: "服务来源", dataIndex: "source", width: 120 },
  { title: "操作描述", dataIndex: "message", ellipsis: true },
  { title: "操作用户", dataIndex: "user", width: 140 },
  { title: "客户端 IP", dataIndex: "ip", width: 150 },
  { title: "结果", dataIndex: "result", slotName: "result", width: 90 }
];

function buildSystemQueryParams(): LogQueryParams {
  const params: LogQueryParams = {
    page: currentPage.value,
    pageSize: currentPageSize.value
  };
  if (dateRange.value.length === 2 && dateRange.value[0] && dateRange.value[1]) {
    params.startDate = new Date(dateRange.value[0] as number).toISOString();
    params.endDate = new Date(dateRange.value[1] as number).toISOString();
  }
  if (levelFilter.value) params.level = levelFilter.value as LogQueryParams["level"];
  if (sourceFilter.value) params.source = sourceFilter.value;
  if (keywordFilter.value.trim()) params.keyword = keywordFilter.value.trim();
  return params;
}

async function loadLogs() {
  loading.value = true;
  try {
    const res = await getLogList(buildSystemQueryParams());
    if (res.data) {
      logs.value = res.data.items;
      pagination.current = res.data.page;
      pagination.pageSize = res.data.pageSize;
      pagination.total = res.data.total;
    }
  } catch (err) {
    Message.error(err instanceof Error ? err.message : "日志查询失败");
    logs.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    const res = await getLogStats();
    if (res.data?.stats) Object.assign(stats, res.data.stats);
  } catch {
    /* 统计失败不阻塞 */
  }
}

function handleFilter() {
  currentPage.value = 1;
  pagination.current = 1;
  loadLogs();
}

function handleReset() {
  dateRange.value = [];
  levelFilter.value = undefined;
  sourceFilter.value = undefined;
  keywordFilter.value = "";
  currentPage.value = 1;
  pagination.current = 1;
  loadLogs();
}

function handlePageChange(page: number) {
  currentPage.value = page;
  pagination.current = page;
  loadLogs();
}

function handlePageSizeChange(pageSize: number) {
  currentPageSize.value = pageSize;
  currentPage.value = 1;
  pagination.current = 1;
  pagination.pageSize = pageSize;
  loadLogs();
}

// ══════════════════════════════════════════════════════════════
//  审计日志
// ══════════════════════════════════════════════════════════════

const auditDateRange = ref<(number | Date | string)[]>([]);
const auditActionFilter = ref<string | undefined>(undefined);
const auditResourceTypeFilter = ref<string | undefined>(undefined);
const auditUserFilter = ref("");

const auditLoading = ref(false);
const auditLogs = ref<AuditLogEntryItem[]>([]);
const auditCurrentPage = ref(1);
const auditCurrentPageSize = ref(12);

const auditStats = reactive({
  todayTotal: 0,
  activeUsers: 0,
  actionDistribution: {} as Record<string, number>
});

const actionTypeCount = computed(() => Object.keys(auditStats.actionDistribution).length);

const auditPagination = reactive({
  current: 1,
  pageSize: 12,
  total: 0,
  showTotal: true,
  showPageSize: true,
  pageSizeOptions: [12, 20, 50, 100]
});

const auditColumns = [
  { title: "时间", dataIndex: "time", slotName: "time", width: 180 },
  { title: "操作类型", dataIndex: "action", width: 130 },
  { title: "资源类型", dataIndex: "resourceType", width: 120 },
  { title: "操作详情", dataIndex: "details", slotName: "details", width: 110 },
  { title: "操作用户", dataIndex: "username", width: 140 },
  { title: "客户端 IP", dataIndex: "ipAddress", width: 150 }
];

function buildAuditQueryParams() {
  const params: Record<string, unknown> = {
    page: auditCurrentPage.value,
    pageSize: auditCurrentPageSize.value
  };
  if (auditDateRange.value.length === 2 && auditDateRange.value[0] && auditDateRange.value[1]) {
    params.startDate = new Date(auditDateRange.value[0] as number).toISOString();
    params.endDate = new Date(auditDateRange.value[1] as number).toISOString();
  }
  if (auditActionFilter.value) params.action = auditActionFilter.value;
  if (auditResourceTypeFilter.value) params.resourceType = auditResourceTypeFilter.value;
  if (auditUserFilter.value.trim()) params.userId = Number(auditUserFilter.value.trim());
  return params;
}

async function loadAuditLogs() {
  auditLoading.value = true;
  try {
    const res = await getAuditLogList(buildAuditQueryParams() as any);
    if (res.data) {
      auditLogs.value = res.data.items;
      auditPagination.current = res.data.page;
      auditPagination.pageSize = res.data.pageSize;
      auditPagination.total = res.data.total;
    }
  } catch (err) {
    Message.error(err instanceof Error ? err.message : "审计日志查询失败");
    auditLogs.value = [];
  } finally {
    auditLoading.value = false;
  }
}

async function loadAuditStats() {
  try {
    const res = await getAuditLogStats();
    if (res.data?.stats) Object.assign(auditStats, res.data.stats);
  } catch {
    /* 统计失败不阻塞 */
  }
}

function handleAuditFilter() {
  auditCurrentPage.value = 1;
  auditPagination.current = 1;
  loadAuditLogs();
}

function handleAuditReset() {
  auditDateRange.value = [];
  auditActionFilter.value = undefined;
  auditResourceTypeFilter.value = undefined;
  auditUserFilter.value = "";
  auditCurrentPage.value = 1;
  auditPagination.current = 1;
  loadAuditLogs();
}

function handleAuditPageChange(page: number) {
  auditCurrentPage.value = page;
  auditPagination.current = page;
  loadAuditLogs();
}

function handleAuditPageSizeChange(pageSize: number) {
  auditCurrentPageSize.value = pageSize;
  auditCurrentPage.value = 1;
  auditPagination.current = 1;
  auditPagination.pageSize = pageSize;
  loadAuditLogs();
}

// ─── 通用工具 ────────────────────────────────────────────────

function formatTime(isoStr: string): string {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function handleExport() {
  Message.info("日志导出功能开发中");
}

// ─── 生命周期 ────────────────────────────────────────────────

onMounted(() => {
  loadLogs();
  loadStats();
});
</script>

<style scoped>
.audit-page {
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

.filter-actions {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.detail-json {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.text-muted {
  color: var(--color-text-4);
}
</style>
