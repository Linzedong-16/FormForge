<template>
  <div class="statistics-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="title-area">
        <h2 class="page-title">问卷答卷数据统计</h2>
        <p class="page-desc">图表化展示各问卷答卷数量、完成率与趋势分析</p>
      </div>
      <a-space>
        <a-range-picker v-model="dateRange" style="width: 260px" />
        <a-button type="outline" @click="exportVisible = true">
          <template #icon><icon-download /></template>
          导出报表
        </a-button>
      </a-space>
    </div>

    <!-- 导出报表弹窗 -->
    <a-modal
      v-model:visible="exportVisible"
      title="选择要导出的问卷"
      @ok="handleExportConfirm"
      @cancel="exportVisible = false"
    >
      <a-select v-model="exportSurveyId" placeholder="请选择一份已发布的问卷" allow-search style="width: 100%">
        <a-option v-for="s in publishedSurveys" :key="s.id" :value="s.id" :label="s.title">
          {{ s.title }} <span style="color: var(--color-text-3)">({{ s.responses_count }} 份答卷)</span>
        </a-option>
      </a-select>
    </a-modal>

    <!-- 汇总统计指标 -->
    <a-row :gutter="16">
      <a-col v-for="card in statCards" :key="card.title" :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic
            :title="card.title"
            :value="card.value"
            :value-style="card.color ? { color: card.color } : undefined"
          >
            <template #suffix
              ><span class="stat-unit">{{ card.unit }}</span></template
            >
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <!-- 7 日答卷趋势 -->
    <a-card v-if="trendBars.length > 0" title="近 7 日答卷趋势" :bordered="false">
      <div class="trend-chart">
        <div v-for="bar in trendBars" :key="bar.date" class="trend-bar-row">
          <span class="trend-date">{{ bar.date }}</span>
          <div class="trend-bar-track">
            <div class="trend-bar-fill" :style="{ width: bar.pct + '%' }"></div>
          </div>
          <span class="trend-count">{{ bar.count }} 份</span>
        </div>
      </div>
    </a-card>
    <a-card v-else :bordered="false">
      <div class="chart-placeholder">
        <p style="color: var(--color-text-3)">暂无答卷数据</p>
      </div>
    </a-card>

    <!-- 各问卷数据明细 -->
    <a-card title="已发布问卷数据明细" :bordered="false">
      <a-table
        :data="publishedSurveys"
        :columns="columns"
        :loading="loading"
        :pagination="{ pageSize: 10, showTotal: true }"
        row-key="id"
      >
        <template #status="{ record }">
          <a-tag :color="record.status === 1 ? 'green' : 'gray'" size="small">
            {{ statusLabel(record.status) }}
          </a-tag>
        </template>
        <template #published_at="{ record }">
          {{ formatDate(record.published_at) }}
        </template>
        <template #updated_at="{ record }">
          {{ formatDate(record.updated_at) }}
        </template>
        <template #operations="{ record }">
          <a-button type="text" size="small" @click="handleViewDetail(record)">统计详情</a-button>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { Message } from "@arco-design/web-vue";
import { useRouter } from "vue-router";
import { getStatsOverview, getSurveyList, exportResponses } from "@/api/modules/survey";
import type { StatsOverviewResponse } from "@common/survey/survey-stats.interface";
import type { SurveyListItem } from "@common/survey/survey.interface";

const router = useRouter();

// ─── 状态 ──────────────────────────────────────────────────────

const loading = ref(false);
const overview = ref<StatsOverviewResponse | null>(null);
const publishedSurveys = ref<SurveyListItem[]>([]);
const dateRange = ref<string[]>([]);

// ─── 汇总指标 ──────────────────────────────────────────────────

const statCards = ref([
  { title: "累计答卷总数", value: 0, unit: "份", color: "" },
  { title: "已发布问卷", value: 0, unit: "份", color: "rgb(var(--green-6))" },
  { title: "今日新增答卷", value: 0, unit: "份", color: "" },
  { title: "本周新增答卷", value: 0, unit: "份", color: "" }
]);

// ─── 表格列 ────────────────────────────────────────────────────

const columns = [
  { title: "问卷标题", dataIndex: "title", ellipsis: true },
  { title: "状态", dataIndex: "status", slotName: "status", width: 90 },
  { title: "总答卷数", dataIndex: "responses_count", width: 90, sorter: true },
  { title: "题目数", dataIndex: "total_questions", width: 80 },
  { title: "发布时间", dataIndex: "published_at", width: 160 },
  { title: "最近更新", dataIndex: "updated_at", width: 160 },
  { title: "操作", slotName: "operations", width: 100 }
];

// ─── 趋势图数据 ────────────────────────────────────────────────

const trendMax = ref(0);
const trendBars = ref<Array<{ date: string; count: number; pct: number }>>([]);

// ─── 数据加载 ──────────────────────────────────────────────────

async function loadData() {
  loading.value = true;
  try {
    // 并行加载概览和问卷列表
    const [overviewRes, surveyRes] = await Promise.all([
      getStatsOverview(),
      getSurveyList({ page_size: 50, status: 1 }) // 仅已发布
    ]);

    if (overviewRes.code === 0 && overviewRes.data) {
      const d = overviewRes.data;
      overview.value = d;
      statCards.value[0].value = d.total_responses;
      statCards.value[1].value = d.published_surveys;
      statCards.value[2].value = d.responses_today;
      statCards.value[3].value = d.responses_this_week;

      // 构建趋势柱状图数据
      if (d.trend_7_days && d.trend_7_days.length > 0) {
        trendMax.value = Math.max(...d.trend_7_days.map(t => t.count), 1);
        trendBars.value = d.trend_7_days.map(t => ({
          date: t.date.slice(5), // "MM-DD"
          count: t.count,
          pct: Math.round((t.count / trendMax.value) * 100)
        }));
      }
    }

    if (surveyRes.code === 0 && surveyRes.data) {
      publishedSurveys.value = surveyRes.data.surveys;
    }
  } catch {
    Message.error("加载统计数据失败");
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});

// 日期范围筛选变化时重新加载
watch(dateRange, () => {
  loadData();
});

// ─── 格式化 ────────────────────────────────────────────────────

function formatDate(val: string | null): string {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusLabel(status: number): string {
  return status === 1 ? "已发布" : status === 0 ? "草稿" : "已关闭";
}

// ─── 导出 ──────────────────────────────────────────────────────

const exportVisible = ref(false);
const exportSurveyId = ref("");

function handleExportConfirm() {
  if (!exportSurveyId.value) {
    Message.warning("请选择一份问卷");
    return;
  }
  const survey = publishedSurveys.value.find(s => s.id === exportSurveyId.value);
  const title = survey?.title ?? "responses";
  exportResponses(exportSurveyId.value, { format: "csv" })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `survey_${exportSurveyId.value}_${title.replace(/[\\/:*?"<>|]/g, "_")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Message.success("导出成功");
      exportVisible.value = false;
    })
    .catch(() => {
      Message.error("导出失败，请检查网络");
    });
}

function handleViewDetail(record: SurveyListItem) {
  router.push(`/survey-management/statistics/${record.id}`);
}
</script>

<style scoped>
.statistics-page {
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

.stat-unit {
  font-size: 13px;
  color: var(--color-text-3);
  margin-left: 4px;
}

/* ── 7 日趋势柱状图 ─────────────────────────────────────── */

.trend-chart {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trend-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.trend-date {
  width: 48px;
  font-size: 13px;
  color: var(--color-text-2);
  text-align: right;
}

.trend-bar-track {
  flex: 1;
  height: 22px;
  background: var(--color-fill-3);
  border-radius: 4px;
  overflow: hidden;
}

.trend-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, rgb(var(--primary-5)), rgb(var(--primary-6)));
  border-radius: 4px;
  transition: width 0.4s ease;
  min-width: 2px;
}

.trend-count {
  width: 60px;
  font-size: 13px;
  color: var(--color-text-2);
}

/* ── 空数据占位 ────────────────────────────────────────── */

.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
}
</style>
