<template>
  <a-card :bordered="false" class="panel-card">
    <template #title>
      <div class="panel-title-row">
        <span>概览</span>
        <a-tag size="small" color="gray">汇总全部环境</a-tag>
      </div>
    </template>

    <!-- 加载中 -->
    <a-spin v-if="status === 'loading'" :loading="true" class="state-loading" />

    <!-- 加载失败：持久化错误块，而不是一闪而过的提示 -->
    <a-result v-else-if="status === 'error'" status="error" :subtitle="errorMessage || '数据加载失败'">
      <template #extra>
        <a-button type="primary" @click="loadAll">重试</a-button>
      </template>
    </a-result>

    <!-- 暂无数据：合法的空态，与加载失败明确区分 -->
    <a-empty v-else-if="status === 'empty'" description="尚无数据，管道可能刚刚部署，还未收到任何事件" />

    <!-- 就绪 -->
    <template v-else>
      <a-row :gutter="12">
        <a-col :span="6">
          <a-statistic title="今日 PV" :value="overview?.pv_today ?? 0" />
        </a-col>
        <a-col :span="6">
          <a-statistic title="今日 UV" :value="overview?.uv_today ?? 0" />
        </a-col>
        <a-col :span="6">
          <a-statistic
            title="今日错误数"
            :value="overview?.errors_today ?? 0"
            :value-style="{ color: 'rgb(var(--red-6))' }"
          />
        </a-col>
        <a-col :span="6">
          <a-statistic title="今日 AI 使用次数" :value="overview?.ai_usage_today ?? 0" />
        </a-col>
      </a-row>
      <a-divider style="margin: 16px 0" />
      <div class="realtime-label">最近 5 分钟实时快照</div>
      <a-row :gutter="12">
        <a-col :span="8">
          <a-statistic title="实时 PV" :value="realtime?.recent_pv ?? 0" :value-style="{ fontSize: '20px' }" />
        </a-col>
        <a-col :span="8">
          <a-statistic
            title="实时错误数"
            :value="realtime?.recent_errors ?? 0"
            :value-style="{ fontSize: '20px', color: 'rgb(var(--red-6))' }"
          />
        </a-col>
        <a-col :span="8">
          <a-statistic
            title="接口平均耗时 (ms)"
            :value="realtime?.recent_api_avg_ms ?? 0"
            :value-style="{ fontSize: '20px' }"
          />
        </a-col>
      </a-row>
    </template>
  </a-card>
</template>

<script setup lang="ts">
/**
 * 概览面板（用户故事 1）
 *
 * 数据来源 /analytics/overview + /analytics/realtime，均不支持 environment/app_id 筛选
 * （见 research.md §7），因此始终展示"汇总全部环境"的数据。
 * getRealtime 每 30 秒轮询一次、getOverview 每 60 秒轮询一次，与后端 Redis 缓存 TTL 对齐，
 * 避免产生无意义的重复请求；两个定时器均在组件卸载时清除。
 */
import { ref, onMounted, onUnmounted } from "vue";
import { getOverview, getRealtime } from "@/api/modules/analytics";
import type { OverviewSnapshot, RealtimeSnapshot } from "@/api/modules/analytics";

type PanelStatus = "loading" | "ready" | "empty" | "error";

const status = ref<PanelStatus>("loading");
const errorMessage = ref("");
const overview = ref<OverviewSnapshot | null>(null);
const realtime = ref<RealtimeSnapshot | null>(null);

function isAllZero(o: OverviewSnapshot | null): boolean {
  if (!o) return true;
  return o.pv_today === 0 && o.uv_today === 0 && o.errors_today === 0 && o.ai_usage_today === 0;
}

async function loadOverview() {
  const res = await getOverview();
  if (res.code === 0) {
    overview.value = res.data;
  } else {
    throw new Error(res.msg || "概览数据加载失败");
  }
}

async function loadRealtime() {
  const res = await getRealtime();
  if (res.code === 0) {
    realtime.value = res.data;
  } else {
    throw new Error(res.msg || "实时数据加载失败");
  }
}

async function loadAll() {
  status.value = "loading";
  try {
    await Promise.all([loadOverview(), loadRealtime()]);
    status.value = isAllZero(overview.value) ? "empty" : "ready";
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : "数据加载失败";
    status.value = "error";
  }
}

/** 静默刷新：轮询时不切回 loading 态，避免界面闪烁；失败也不打断已展示的数据 */
async function refreshSilently() {
  try {
    await Promise.all([loadOverview(), loadRealtime()]);
    if (status.value !== "error") {
      status.value = isAllZero(overview.value) ? "empty" : "ready";
    }
  } catch {
    // 轮询失败保留上一次的展示数据，不打断用户查看，下一轮再重试
  }
}

let realtimeTimer: ReturnType<typeof setInterval> | undefined;
let overviewTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  loadAll();
  realtimeTimer = setInterval(refreshSilently, 30_000);
  overviewTimer = setInterval(refreshSilently, 60_000);
});

onUnmounted(() => {
  if (realtimeTimer) clearInterval(realtimeTimer);
  if (overviewTimer) clearInterval(overviewTimer);
});
</script>

<style scoped>
.panel-card {
  width: 100%;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.realtime-label {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--color-text-3);
}
</style>
