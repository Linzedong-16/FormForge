<template>
  <div class="errors-performance-page">
    <a-card :bordered="false" class="panel-card">
      <template #title>错误</template>

      <a-spin v-if="errorsStatus === 'loading'" :loading="true" class="state-loading" />

      <a-result v-else-if="errorsStatus === 'error'" status="error" :subtitle="errorsErrorMessage || '数据加载失败'">
        <template #extra>
          <a-button type="primary" @click="loadErrors">重试</a-button>
        </template>
      </a-result>

      <a-empty v-else-if="errorsStatus === 'empty'" description="所选时间范围/筛选条件下暂无错误数据" />

      <template v-else>
        <VChart class="trend-chart" :option="errorsTrendOption" autoresize />
        <a-table :data="errors" :pagination="false" row-key="error_group_key" :bordered="{ wrapper: true, cell: true }">
          <template #columns>
            <a-table-column title="错误类型" data-index="error_type" :width="140" />
            <a-table-column title="错误消息" data-index="error_message" :ellipsis="true" :tooltip="true" />
            <a-table-column title="出现次数" data-index="count" :width="100" align="center" />
            <a-table-column title="受影响用户数" data-index="affected_users" :width="120" align="center" />
            <a-table-column title="受影响会话数" data-index="affected_sessions" :width="120" align="center" />
            <a-table-column title="首次出现" data-index="first_seen" :width="180" />
            <a-table-column title="最近出现" data-index="last_seen" :width="180" />
          </template>
        </a-table>
      </template>
    </a-card>

    <a-card :bordered="false" class="panel-card">
      <template #title>
        <div class="panel-title-row">
          <span>性能</span>
          <a-select v-model="metric" style="width: 160px" size="small">
            <a-option value="fcp">FCP</a-option>
            <a-option value="lcp">LCP</a-option>
            <a-option value="cls">CLS</a-option>
            <a-option value="inp">INP</a-option>
            <a-option value="api_duration">接口耗时</a-option>
            <a-option value="editor_load">编辑器加载耗时</a-option>
            <a-option value="editor_save">编辑器保存耗时</a-option>
          </a-select>
        </div>
      </template>

      <a-spin v-if="perfStatus === 'loading'" :loading="true" class="state-loading" />

      <a-result v-else-if="perfStatus === 'error'" status="error" :subtitle="perfErrorMessage || '数据加载失败'">
        <template #extra>
          <a-button type="primary" @click="loadPerformance">重试</a-button>
        </template>
      </a-result>

      <a-empty v-else-if="perfStatus === 'empty'" description="所选指标/筛选条件下暂无性能数据" />

      <template v-else>
        <a-row :gutter="12" style="margin-bottom: 16px">
          <a-col :span="4"><a-statistic title="P50" :value="current?.p50 ?? 0" /></a-col>
          <a-col :span="4"><a-statistic title="P75" :value="current?.p75 ?? 0" /></a-col>
          <a-col :span="4"><a-statistic title="P95" :value="current?.p95 ?? 0" /></a-col>
          <a-col :span="4"><a-statistic title="P99" :value="current?.p99 ?? 0" /></a-col>
          <a-col :span="4"><a-statistic title="平均值" :value="current?.avg ?? 0" /></a-col>
          <a-col :span="4"><a-statistic title="样本数" :value="current?.sample_count ?? 0" /></a-col>
        </a-row>
        <VChart class="trend-chart" :option="perfTrendOption" autoresize />
      </template>
    </a-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 错误性能面板（用户故事 2 + 用户故事 3 合并）
 *
 * 错误排行表格 + 错误趋势曲线、性能百分位 + 性能趋势曲线，均随共享筛选状态
 * （时间范围/应用/环境）变化重新请求；两部分各自维护独立的加载状态机。
 */
import { ref, computed, watch, onMounted } from "vue";
import { getErrors, getTrend, getPerformance } from "@/api/modules/analytics";
import type { ErrorSummaryItem, PerformanceMetric, PerformancePercentiles, TrendPoint } from "@/api/modules/analytics";
import { useAnalyticsFilters } from "@/composables/useAnalyticsFilters";
import { VChart } from "@/plugins/echarts";

type PanelStatus = "loading" | "ready" | "empty" | "error";

const { filters } = useAnalyticsFilters();

// ── 错误排行 + 趋势 ──────────────────────────────────────────

const errorsStatus = ref<PanelStatus>("loading");
const errorsErrorMessage = ref("");
const errors = ref<ErrorSummaryItem[]>([]);
const errorsTrendPoints = ref<TrendPoint[]>([]);

const errorsTrendOption = computed(() => ({
  tooltip: { trigger: "axis" as const },
  grid: { left: 40, right: 20, top: 20, bottom: 30 },
  xAxis: { type: "category" as const, data: errorsTrendPoints.value.map(p => p.time) },
  yAxis: { type: "value" as const },
  series: [{ type: "line" as const, name: "错误数", data: errorsTrendPoints.value.map(p => p.value) }]
}));

async function loadErrors() {
  errorsStatus.value = "loading";
  try {
    const [errorsRes, trendRes] = await Promise.all([
      getErrors({
        range: filters.range,
        environment: filters.environment,
        appId: filters.appId,
        topN: 10
      }),
      getTrend({
        metric: "errors",
        granularity: "hour",
        range: filters.range,
        environment: filters.environment,
        appId: filters.appId
      })
    ]);

    if (errorsRes.code !== 0) throw new Error(errorsRes.msg || "错误数据加载失败");
    if (trendRes.code !== 0) throw new Error(trendRes.msg || "错误趋势加载失败");

    errors.value = errorsRes.data?.errors ?? [];
    errorsTrendPoints.value = trendRes.data?.points ?? [];
    errorsStatus.value = errors.value.length === 0 ? "empty" : "ready";
  } catch (err) {
    errorsErrorMessage.value = err instanceof Error ? err.message : "数据加载失败";
    errorsStatus.value = "error";
  }
}

// 筛选条件变化 → 重新请求（对应 FR-009/SC-004）
watch(() => [filters.range, filters.environment, filters.appId], loadErrors);
onMounted(loadErrors);

// ── 性能百分位 + 趋势 ────────────────────────────────────────

const metric = ref<PerformanceMetric>("lcp");
const perfStatus = ref<PanelStatus>("loading");
const perfErrorMessage = ref("");
const current = ref<PerformancePercentiles | null>(null);
const perfTrendPoints = ref<TrendPoint[]>([]);

const perfTrendOption = computed(() => ({
  tooltip: { trigger: "axis" as const },
  grid: { left: 40, right: 20, top: 20, bottom: 30 },
  xAxis: { type: "category" as const, data: perfTrendPoints.value.map(p => p.time) },
  yAxis: { type: "value" as const },
  series: [{ type: "line" as const, name: metric.value, data: perfTrendPoints.value.map(p => p.value) }]
}));

async function loadPerformance() {
  perfStatus.value = "loading";
  try {
    const res = await getPerformance({
      metric: metric.value,
      range: filters.range,
      environment: filters.environment,
      appId: filters.appId
    });
    if (res.code !== 0) throw new Error(res.msg || "性能数据加载失败");

    current.value = res.data?.current ?? null;
    perfTrendPoints.value = res.data?.trend_points ?? [];
    perfStatus.value = !current.value || current.value.sample_count === 0 ? "empty" : "ready";
  } catch (err) {
    perfErrorMessage.value = err instanceof Error ? err.message : "数据加载失败";
    perfStatus.value = "error";
  }
}

watch(() => [filters.range, filters.environment, filters.appId, metric.value], loadPerformance);
onMounted(loadPerformance);
</script>

<style scoped>
.errors-performance-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-card {
  width: 100%;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trend-chart {
  height: 220px;
  margin-bottom: 16px;
}
</style>
