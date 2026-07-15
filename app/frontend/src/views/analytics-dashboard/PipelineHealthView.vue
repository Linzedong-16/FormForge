<template>
  <a-card :bordered="false" class="panel-card">
    <template #title>
      <div class="panel-title-row">
        <span>管道健康</span>
        <a-tag size="small" color="gray">汇总全部环境</a-tag>
      </div>
    </template>

    <!-- 加载中 -->
    <a-spin v-if="status === 'loading'" :loading="true" class="state-loading" />

    <!-- 加载失败：持久化错误块，而不是一闪而过的提示 -->
    <a-result v-else-if="status === 'error'" status="error" :subtitle="errorMessage || '数据加载失败'">
      <template #extra>
        <a-button type="primary" @click="load">重试</a-button>
      </template>
    </a-result>

    <!-- 就绪：总体状态 + 各依赖服务连通性表格 -->
    <template v-else>
      <a-row :gutter="12" style="margin-bottom: 16px">
        <a-col :span="8">
          <div class="summary-item">
            <div class="summary-title">总体状态</div>
            <a-tag :color="health?.status === 'ok' ? 'green' : 'red'" size="large">
              {{ health?.status === "ok" ? "正常" : "部分异常" }}
            </a-tag>
          </div>
        </a-col>
        <a-col :span="8">
          <div class="summary-item">
            <div class="summary-title">服务运行时长</div>
            <span class="summary-value">{{ uptimeLabel }}</span>
          </div>
        </a-col>
        <a-col :span="8">
          <a-statistic title="依赖服务数" :value="serviceRows.length" />
        </a-col>
      </a-row>

      <a-table :data="serviceRows" :pagination="false" row-key="key" :bordered="{ wrapper: true, cell: true }">
        <template #columns>
          <a-table-column title="服务" data-index="label" :width="160" />
          <a-table-column title="状态" :width="120" align="center">
            <template #cell="{ record }">
              <a-tag :color="record.ok ? 'green' : 'red'" size="small">{{ record.ok ? "正常" : "异常" }}</a-tag>
            </template>
          </a-table-column>
          <a-table-column title="延迟 (ms)" data-index="latencyMs" :width="120" align="center">
            <template #cell="{ record }">{{ record.latencyMs ?? "-" }}</template>
          </a-table-column>
          <a-table-column title="错误信息" data-index="error" :ellipsis="true" :tooltip="true">
            <template #cell="{ record }">{{ record.error || "-" }}</template>
          </a-table-column>
        </template>
      </a-table>
    </template>
  </a-card>
</template>

<script setup lang="ts">
/**
 * 管道健康面板
 *
 * 复用既有的 GET /api/health（getHealthStatus），展示埋点数据管道所依赖的
 * PostgreSQL/Redis/RabbitMQ/MinIO/MongoDB/ClickHouse 六项服务的连通性和延迟。
 * 该接口不支持时间范围/应用/环境筛选，始终展示"汇总全部环境"的最新一次探测结果。
 * 每 30 秒轮询一次，与概览面板的实时快照轮询频率保持一致。
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import { getHealthStatus } from "@/api/modules/admin";
import type { HealthCheckResult } from "@/api/modules/admin";

type PanelStatus = "loading" | "ready" | "error";

/** 服务标识 → 中文名称映射 */
const SERVICE_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  redis: "Redis",
  rabbitmq: "RabbitMQ",
  minio: "MinIO",
  mongodb: "MongoDB",
  clickhouse: "ClickHouse"
};

const status = ref<PanelStatus>("loading");
const errorMessage = ref("");
const health = ref<HealthCheckResult | null>(null);

const serviceRows = computed(() => {
  if (!health.value) return [];
  return Object.entries(health.value.checks).map(([key, check]) => ({
    key,
    label: SERVICE_LABELS[key] || key,
    ok: check.ok,
    latencyMs: check.latency_ms,
    error: check.error
  }));
});

const uptimeLabel = computed(() => {
  const seconds = health.value?.uptime ?? 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
});

async function load() {
  status.value = "loading";
  try {
    const res = await getHealthStatus();
    // 后端 /health 在部分服务异常（degraded）时会返回 code=500，但仍携带完整 checks 数据
    // （见 q-server routes/index.ts），因此这里只在真正拿不到数据时才算失败，
    // 是否 degraded 交给下方模板用 res.data.status 展示，而不是提前抛错吞掉明细
    if (!res.data) throw new Error(res.msg || "健康检查数据加载失败");
    health.value = res.data;
    status.value = "ready";
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : "数据加载失败";
    status.value = "error";
  }
}

/** 静默刷新：轮询时不切回 loading 态，避免界面闪烁；失败也不打断已展示的数据 */
async function refreshSilently() {
  try {
    const res = await getHealthStatus();
    if (res.data) {
      health.value = res.data;
      status.value = "ready";
    }
  } catch {
    // 轮询失败保留上一次的展示数据，下一轮再重试
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  load();
  timer = setInterval(refreshSilently, 30_000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.panel-card {
  width: 100%;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-title {
  font-size: 12px;
  color: var(--color-text-3);
}

.summary-value {
  font-size: 24px;
  font-weight: 500;
  color: var(--color-text-1);
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
