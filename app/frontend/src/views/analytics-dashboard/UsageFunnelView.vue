<template>
  <a-card :bordered="false" class="panel-card">
    <template #title>用量与漏斗</template>

    <a-spin v-if="trendStatus === 'loading'" :loading="true" style="width: 100%; padding: 32px 0" />

    <a-result v-else-if="trendStatus === 'error'" status="error" :subtitle="trendErrorMessage || '数据加载失败'">
      <template #extra>
        <a-button type="primary" @click="loadTrend">重试</a-button>
      </template>
    </a-result>

    <a-empty v-else-if="trendStatus === 'empty'" description="所选时间范围/筛选条件下暂无用量数据" />

    <VChart v-else class="trend-chart" :option="trendOption" autoresize />

    <a-divider style="margin: 16px 0" />

    <div class="panel-title-row">
      <span class="section-label">业务漏斗</span>
      <a-tag size="small" color="gray">汇总全部环境</a-tag>
      <a-select v-model="funnelName" style="width: 160px; margin-left: auto" size="small">
        <a-option value="survey_creation">问卷创建</a-option>
        <a-option value="survey_response">问卷填答</a-option>
      </a-select>
    </div>

    <a-spin v-if="funnelStatus === 'loading'" :loading="true" style="width: 100%; padding: 32px 0" />

    <a-result v-else-if="funnelStatus === 'error'" status="error" :subtitle="funnelErrorMessage || '数据加载失败'">
      <template #extra>
        <a-button type="primary" @click="loadFunnel">重试</a-button>
      </template>
    </a-result>

    <a-empty v-else-if="funnelStatus === 'empty'" description="所选漏斗暂无数据" />

    <a-table
      v-else
      :data="funnelSteps"
      :pagination="false"
      row-key="name"
      :bordered="{ wrapper: true, cell: true }"
      style="margin-top: 12px"
    >
      <template #columns>
        <a-table-column title="步骤" data-index="name" :width="160" />
        <a-table-column title="次数" data-index="count" :width="100" align="center" />
        <a-table-column title="相对首步转化率" :width="140" align="center">
          <template #cell="{ record }">{{ record.rate.toFixed(1) }}%</template>
        </a-table-column>
        <a-table-column title="相对上一步转化率" :width="140" align="center">
          <template #cell="{ record }">{{ record.prev_step_rate.toFixed(1) }}%</template>
        </a-table-column>
      </template>
    </a-table>
  </a-card>
</template>

<script setup lang="ts">
/**
 * 用量与漏斗面板（用户故事 4）
 *
 * PV/UV 趋势遵循共享的环境筛选；漏斗接口不支持 environment 筛选（见 research.md §7），
 * 始终展示"汇总全部环境"的数据，因此漏斗切换/刷新与环境筛选无关，只随漏斗名称/时间范围变化。
 */
import { ref, computed, watch, onMounted } from "vue";
import { getTrend, getFunnel } from "@/api/modules/analytics";
import type { FunnelStep } from "@/api/modules/analytics";
import { useAnalyticsFilters } from "@/composables/useAnalyticsFilters";
import { VChart } from "@/plugins/echarts";

type PanelStatus = "loading" | "ready" | "empty" | "error";

const { filters } = useAnalyticsFilters();

// ── PV/UV 趋势 ──────────────────────────────────────────────

const trendStatus = ref<PanelStatus>("loading");
const trendErrorMessage = ref("");
const pvPoints = ref<{ time: string; value: number }[]>([]);
const uvPoints = ref<{ time: string; value: number }[]>([]);

const trendOption = computed(() => ({
  tooltip: { trigger: "axis" as const },
  legend: { data: ["PV", "UV"] },
  grid: { left: 40, right: 20, top: 40, bottom: 30 },
  xAxis: { type: "category" as const, data: pvPoints.value.map(p => p.time) },
  yAxis: { type: "value" as const },
  series: [
    { type: "line" as const, name: "PV", data: pvPoints.value.map(p => p.value) },
    { type: "line" as const, name: "UV", data: uvPoints.value.map(p => p.value) }
  ]
}));

async function loadTrend() {
  trendStatus.value = "loading";
  try {
    const [pvRes, uvRes] = await Promise.all([
      getTrend({
        metric: "pv",
        granularity: "hour",
        range: filters.range,
        environment: filters.environment,
        appId: filters.appId
      }),
      getTrend({
        metric: "uv",
        granularity: "hour",
        range: filters.range,
        environment: filters.environment,
        appId: filters.appId
      })
    ]);
    if (pvRes.code !== 0) throw new Error(pvRes.msg || "PV 趋势加载失败");
    if (uvRes.code !== 0) throw new Error(uvRes.msg || "UV 趋势加载失败");

    pvPoints.value = pvRes.data?.points ?? [];
    uvPoints.value = uvRes.data?.points ?? [];
    trendStatus.value = pvPoints.value.length === 0 && uvPoints.value.length === 0 ? "empty" : "ready";
  } catch (err) {
    trendErrorMessage.value = err instanceof Error ? err.message : "数据加载失败";
    trendStatus.value = "error";
  }
}

watch(() => [filters.range, filters.environment, filters.appId], loadTrend);
onMounted(loadTrend);

// ── 业务漏斗 ────────────────────────────────────────────────

const funnelName = ref<"survey_creation" | "survey_response">("survey_creation");
const funnelStatus = ref<PanelStatus>("loading");
const funnelErrorMessage = ref("");
const funnelSteps = ref<FunnelStep[]>([]);

async function loadFunnel() {
  funnelStatus.value = "loading";
  try {
    const res = await getFunnel({ funnelName: funnelName.value, range: filters.range, appId: filters.appId });
    if (res.code !== 0) throw new Error(res.msg || "漏斗数据加载失败");

    funnelSteps.value = res.data?.steps ?? [];
    funnelStatus.value = funnelSteps.value.length === 0 ? "empty" : "ready";
  } catch (err) {
    funnelErrorMessage.value = err instanceof Error ? err.message : "数据加载失败";
    funnelStatus.value = "error";
  }
}

// 漏斗不支持环境筛选，只随漏斗名称/时间范围/应用变化重新请求
watch(() => [funnelName.value, filters.range, filters.appId], loadFunnel);
onMounted(loadFunnel);
</script>

<style scoped>
.panel-card {
  width: 100%;
}

.trend-chart {
  height: 220px;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-label {
  font-weight: 500;
}
</style>
