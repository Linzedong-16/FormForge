<template>
  <div class="stats-detail-page">
    <!-- 顶部导航：返回 + 标题 -->
    <div class="page-header">
      <a-space>
        <a-button type="text" @click="goBack">
          <template #icon><icon-arrow-left /></template>
        </a-button>
        <h2 class="page-title">{{ surveyTitle || "问卷答卷统计详情" }}</h2>
      </a-space>
      <a-space>
        <a-button v-if="userStore.isSuperAdmin" type="outline" @click="goToAgentAnalysis">
          <template #icon><icon-robot /></template>
          AI 分析
        </a-button>
        <a-button type="primary" :loading="exporting" @click="handleExportCSV">
          <template #icon><icon-download /></template>
          导出 CSV
        </a-button>
      </a-space>
    </div>

    <!-- 加载态 -->
    <a-spin v-if="loading" :loading="true" class="state-spin" />

    <!-- 错误态 -->
    <a-result v-else-if="errorMsg" status="error" :subtitle="errorMsg">
      <template #extra>
        <a-button type="primary" @click="loadData">重试</a-button>
      </template>
    </a-result>

    <!-- 数据就绪 -->
    <template v-else-if="stats">
      <!-- 汇总指标卡 -->
      <a-row :gutter="16" class="summary-row">
        <a-col :span="6">
          <a-card :bordered="false" class="stat-card">
            <a-statistic title="总答卷数" :value="stats.total_responses" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card :bordered="false" class="stat-card">
            <a-statistic title="有效答卷" :value="stats.valid_responses" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card :bordered="false" class="stat-card">
            <a-statistic title="完成率" :value="stats.completion_rate" suffix="%" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card :bordered="false" class="stat-card">
            <a-statistic title="题目数" :value="stats.questions.length" suffix="题" />
          </a-card>
        </a-col>
      </a-row>

      <!-- 每日答卷趋势 -->
      <a-card :bordered="false" class="section-card">
        <template #title>每日答卷趋势</template>
        <VChart v-if="trendOption" class="trend-chart" :option="trendOption" autoresize />
        <a-empty v-else description="暂无趋势数据" />
      </a-card>

      <!-- 逐题统计 -->
      <a-card v-if="stats.questions.length > 0" :bordered="false" class="section-card">
        <template #title>逐题统计 ({{ stats.questions.length }} 题)</template>
        <div class="question-list">
          <div v-for="(q, idx) in stats.questions" :key="q.component_id" class="question-card">
            <div class="question-header">
              <span class="question-index">{{ idx + 1 }}.</span>
              <span class="question-type">
                <a-tag size="small" :color="typeTagColor(q.type)">
                  {{ typeLabel(q.type) }}
                </a-tag>
              </span>
              <span class="question-title-text">{{ q.title || "未命名题目" }}</span>
              <span class="question-count">{{ q.total_answers }} 人作答</span>
            </div>

            <div class="question-body">
              <!-- 无答案 -->
              <a-empty v-if="q.total_answers === 0" description="暂无答题数据" class="mini-empty" />

              <!-- 选择类：横向条形图 -->
              <VChart
                v-else-if="isChoiceType(q.type) && q.options_distribution?.length"
                class="dist-chart"
                :option="barChartOption(q)"
                autoresize
              />

              <!-- 数值类：指标 + 柱状分布图 -->
              <template v-else-if="isNumericType(q.type)">
                <a-row :gutter="12" class="numeric-stats">
                  <a-col :span="6"><a-statistic title="平均值" :value="q.average ?? 0" /></a-col>
                  <a-col :span="6"><a-statistic title="最小值" :value="q.min ?? 0" /></a-col>
                  <a-col :span="6"><a-statistic title="最大值" :value="q.max ?? 0" /></a-col>
                </a-row>
                <VChart
                  v-if="q.options_distribution?.length"
                  class="dist-chart"
                  :option="barChartOption(q)"
                  autoresize
                />
              </template>

              <!-- 文本类：抽样原文列表 -->
              <template v-else-if="isTextType(q.type)">
                <div class="text-meta">
                  <span>总答案数：{{ q.total_answers }}</span>
                  <span class="empty-rate">空值率：{{ emptyRate(q) }}%</span>
                </div>
                <a-list v-if="q.sample_answers?.length" size="small" :bordered="false" :data="q.sample_answers">
                  <template #item="{ item, index: ai }">
                    <a-list-item>
                      <span class="sample-index">{{ ai + 1 }}.</span>
                      <span class="sample-text">{{ item || "(空)" }}</span>
                    </a-list-item>
                  </template>
                </a-list>
                <a-empty v-else description="暂无抽样答案" class="mini-empty" />
              </template>

              <!-- 矩阵类：行列交叉表 -->
              <a-table
                v-else-if="q.type === 'matrix_single' && q.options_distribution?.length"
                :data="matrixTableData(q.options_distribution)"
                :pagination="false"
                size="small"
                :bordered="{ wrapper: true, cell: true }"
              >
                <template #columns>
                  <a-table-column title="选项组合" data-index="label" />
                  <a-table-column title="选择次数" data-index="count" :width="120" align="center" />
                  <a-table-column title="占比" data-index="pct" :width="100" align="center" />
                </template>
              </a-table>

              <!-- 单选题但无 options_distribution（向后兼容） -->
              <a-list
                v-else-if="q.options_distribution?.length"
                size="small"
                :bordered="false"
                :data="q.options_distribution"
              >
                <template #item="{ item }">
                  <a-list-item>
                    <span class="option-label">{{ item.label }}</span>
                    <span class="option-bar-track">
                      <span class="option-bar-fill" :style="{ width: item.percentage + '%' }"></span>
                    </span>
                    <span class="option-count">{{ item.count }} ({{ item.percentage }}%)</span>
                  </a-list-item>
                </template>
              </a-list>

              <a-empty v-else description="暂无分布数据" class="mini-empty" />
            </div>
          </div>
        </div>
      </a-card>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 单问卷答卷统计详情页
 *
 * 按题型分策略展示逐题聚合分析结果：
 *   选择题 → 横向条形图（选项频次分布）
 *   评分/滑块 → 平均值/最值 + 分值分布柱状图
 *   文本/个人信息 → 最近 10 条抽样原文
 *   矩阵单选 → 行列交叉表
 *   日期/级联 → 频次条形图
 *   签名 → 有/无签名计数
 *
 * API: GET /api/admin/surveys/:id/stats → SurveyStatsResponse
 */
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getSurveyStats, exportResponses } from "@/api/modules/survey";
import type { SurveyStatsResponse, QuestionStats, OptionDistribution } from "@common/survey/survey-stats.interface";
import { VChart } from "@/plugins/echarts";
import { useUserStore } from "@/store/modules/user";
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

// ─── 状态 ──────────────────────────────────────────────────────

const loading = ref(true);
const errorMsg = ref("");
const stats = ref<SurveyStatsResponse | null>(null);
const exporting = ref(false);

// ─── 题型分类映射（与后端 TYPE_NAME_MAP 保持一致） ────────────────

const TYPE_NAME_MAP: Record<string, string> = {
  single_select: "单选题",
  multi_select: "多选题",
  option_select: "下拉选择",
  single_pic_select: "图片单选",
  multi_pic_select: "图片多选",
  text_input: "文本输入",
  text_note: "展示说明",
  date_time: "日期时间",
  rate_score: "评分题",
  cascader: "多级联动",
  matrix_single: "矩阵单选",
  slider: "滑块题",
  transfer: "排序题",
  signature: "电子签名",
  "personal-info-name": "姓名",
  "personal-info-id": "身份证号",
  "personal-info-gender": "性别",
  "personal-info-age": "年龄",
  "personal-info-education": "学历",
  "personal-info-career": "职业",
  "personal-info-collage": "学校",
  "personal-info-major": "专业",
  "personal-info-industry": "行业",
  "personal-info-company": "公司",
  "personal-info-position": "岗位",
  "personal-info-address": "地址",
  "personal-info-tel": "电话",
  "personal-info-wechat": "微信",
  "personal-info-qq": "QQ",
  "personal-info-email": "邮箱"
};

/** 选择题类题型（使用横向条形图） */
const CHOICE_TYPES = new Set([
  "single_select",
  "multi_select",
  "option_select",
  "single_pic_select",
  "multi_pic_select",
  "transfer",
  "date_time",
  "cascader",
  "personal-info-gender",
  "personal-info-age",
  "personal-info-education",
  "personal-info-career"
]);

/** 数值类题型（avg/min/max + 分布） */
const NUMERIC_TYPES = new Set(["rate_score", "slider"]);

/** 文本类题型（抽样原文） */
const TEXT_TYPES = new Set([
  "text_input",
  "personal-info-name",
  "personal-info-id",
  "personal-info-collage",
  "personal-info-major",
  "personal-info-industry",
  "personal-info-company",
  "personal-info-position",
  "personal-info-address",
  "personal-info-tel",
  "personal-info-wechat",
  "personal-info-qq",
  "personal-info-email"
]);

function typeLabel(type: string): string {
  return TYPE_NAME_MAP[type] ?? type;
}

/** 题型标签颜色 */
function typeTagColor(type: string): string {
  if (CHOICE_TYPES.has(type)) return "blue";
  if (NUMERIC_TYPES.has(type)) return "orange";
  if (TEXT_TYPES.has(type)) return "green";
  if (type === "matrix_single") return "purple";
  if (type === "signature") return "gray";
  return "arcoblue";
}

function isChoiceType(type: string): boolean {
  return CHOICE_TYPES.has(type);
}

function isNumericType(type: string): boolean {
  return NUMERIC_TYPES.has(type);
}

function isTextType(type: string): boolean {
  return TEXT_TYPES.has(type);
}

// ─── 数据加载 ──────────────────────────────────────────────────

const surveyTitle = computed(() => stats.value?.title ?? "");

async function loadData() {
  const surveyId = route.params.id as string;
  if (!surveyId) {
    errorMsg.value = "缺少问卷 ID";
    loading.value = false;
    return;
  }

  loading.value = true;
  errorMsg.value = "";

  try {
    const res = await getSurveyStats(surveyId);
    if (res.code === 0 && res.data) {
      stats.value = res.data;
    } else {
      errorMsg.value = res.msg || "加载统计数据失败";
    }
  } catch (err: unknown) {
    const message =
      (err as { message?: string })?.message ??
      (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ??
      "网络错误，请检查后端服务";
    errorMsg.value = message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});

// ─── 趋势折线图 ────────────────────────────────────────────────

const trendOption = computed(() => {
  const trend = stats.value?.daily_trend;
  if (!trend || trend.length === 0) return null;
  return {
    tooltip: { trigger: "axis" as const },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: { type: "category" as const, data: trend.map(t => t.date) },
    yAxis: { type: "value" as const, minInterval: 1 },
    series: [
      {
        name: "答卷数",
        type: "line" as const,
        data: trend.map(t => t.count),
        smooth: true,
        areaStyle: { opacity: 0.15 }
      }
    ]
  };
});

// ─── 选择题/日期/级联 横向条形图 ─────────────────────────────────

function barChartOption(q: QuestionStats) {
  const data = q.options_distribution ?? [];
  // 按频次降序排列
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const labels = sorted.map(d => d.label);
  const counts = sorted.map(d => d.count);
  const pcts = sorted.map(d => d.percentage);
  return {
    tooltip: {
      trigger: "axis" as const,
      formatter: (params: Array<{ name: string; value: number; dataIndex: number }>) => {
        const p = params[0];
        return `${p.name}<br/>选择人次: ${p.value}<br/>占比: ${pcts[p.dataIndex]}%`;
      }
    },
    grid: { left: 120, right: 20, top: 10, bottom: 20 },
    xAxis: { type: "value" as const, name: "人次" },
    yAxis: {
      type: "category" as const,
      data: labels,
      axisLabel: { width: 100, overflow: "truncate" }
    },
    series: [
      {
        name: "选择人次",
        type: "bar" as const,
        data: counts,
        itemStyle: { color: "rgb(var(--primary-5))" }
      }
    ]
  };
}

// ─── 文本题空值率 ──────────────────────────────────────────────

function emptyRate(q: QuestionStats): string {
  if (!q.total_answers) return "0.0";
  // sample_answers 长度与 total_answers 的差值*可估算空值率*
  // 实际空值 = total_answers - (sample_answers 中非空的条数)
  // 这里展示采样中的空值占比作为近似
  const samples = q.sample_answers ?? [];
  if (samples.length === 0 || q.total_answers === 0) return "0.0";
  // 后端抽样取最近10条或全部，无法精确计算全局空值率，使用 "—" 近似
  const emptyCount = samples.filter(s => !s || s.trim() === "").length;
  return ((emptyCount / samples.length) * 100).toFixed(1);
}

// ─── 矩阵交叉表 ────────────────────────────────────────────────

function matrixTableData(distribution: OptionDistribution[]) {
  return distribution.map(d => ({ ...d, pct: `${d.percentage}%` }));
}

// ─── CSV 导出 ──────────────────────────────────────────────────

async function handleExportCSV() {
  const surveyId = route.params.id as string;
  if (!surveyId) return;

  exporting.value = true;
  try {
    const blob = await exportResponses(surveyId, { format: "csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `survey_${surveyId}_${(stats.value?.title ?? "responses").replace(/[\\/:*?"<>|]/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // 导出失败静默处理（后端已在路由层处理错误响应）
  } finally {
    exporting.value = false;
  }
}

// ─── 导航 ──────────────────────────────────────────────────────

function goBack() {
  router.back();
}

/** 跳转至 AI 问卷分析页，预填当前问卷 ID */
function goToAgentAnalysis() {
  const surveyId = route.params.id as string;
  router.push({ path: "/agent-analysis", query: { survey_id: surveyId } });
}
</script>

<style scoped>
.stats-detail-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── 顶部标题栏 ───────────────────────────────────────────── */

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-1);
}

/* ── 加载/错误 ─────────────────────────────────────────────── */

.state-spin {
  display: flex;
  justify-content: center;
  padding: 80px 0;
}

/* ── 汇总指标卡 ────────────────────────────────────────────── */

.summary-row {
  margin-bottom: 0;
}

.stat-card {
  text-align: center;
}

/* ── 区域卡片 ──────────────────────────────────────────────── */

.section-card {
  margin-bottom: 0;
}

/* ── 趋势图 ────────────────────────────────────────────────── */

.trend-chart {
  width: 100%;
  height: 300px;
}

/* ── 逐题列表 ──────────────────────────────────────────────── */

.question-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.question-card {
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  padding: 16px;
  background: var(--color-fill-1);
}

.question-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.question-index {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-1);
  min-width: 24px;
}

.question-title-text {
  font-size: 14px;
  color: var(--color-text-1);
  flex: 1;
}

.question-count {
  font-size: 12px;
  color: var(--color-text-3);
  white-space: nowrap;
}

.question-body {
  padding-left: 32px;
}

/* ── 分布图 ────────────────────────────────────────────────── */

.dist-chart {
  width: 100%;
  height: 260px;
}

/* ── 数值指标 ──────────────────────────────────────────────── */

.numeric-stats {
  margin-bottom: 12px;
}

/* ── 文本抽样 ──────────────────────────────────────────────── */

.text-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--color-text-2);
}

.empty-rate {
  color: var(--color-text-3);
}

.sample-index {
  min-width: 24px;
  font-size: 13px;
  color: var(--color-text-3);
}

.sample-text {
  font-size: 13px;
  color: var(--color-text-1);
  word-break: break-all;
}

/* ── 纯列表选项分布（fallback） ────────────────────────────── */

.option-label {
  min-width: 120px;
  font-size: 13px;
  color: var(--color-text-1);
}

.option-bar-track {
  flex: 1;
  height: 18px;
  background: var(--color-fill-3);
  border-radius: 4px;
  overflow: hidden;
  margin: 0 12px;
}

.option-bar-fill {
  display: block;
  height: 100%;
  background: rgb(var(--primary-5));
  border-radius: 4px;
  transition: width 0.4s ease;
  min-width: 2px;
}

.option-count {
  min-width: 120px;
  font-size: 12px;
  color: var(--color-text-2);
  text-align: right;
}

/* ── 空数据占位 ────────────────────────────────────────────── */

.mini-empty {
  padding: 16px 0;
}
</style>
