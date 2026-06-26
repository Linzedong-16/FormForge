<template>
  <div class="tokens-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="title-area">
        <h2 class="page-title">DeepSeek API 用量监控</h2>
        <p class="page-desc">查询 DeepSeek API 账户余额、Token 消耗量与预估费用</p>
      </div>
      <a-space>
        <a-button type="outline" :loading="loading" @click="handleRefresh">
          <template #icon><icon-refresh /></template>
          刷新数据
        </a-button>
      </a-space>
    </div>

    <!-- 汇总卡片 -->
    <a-row :gutter="16">
      <a-col v-for="card in statCards" :key="card.title" :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic
            :title="card.title"
            :value="typeof card.value === 'number' ? card.value : undefined"
            :value-style="card.color ? { color: card.color } : { fontSize: '28px' }"
          >
            <template #suffix
              ><span class="stat-unit">{{ card.unit }}</span></template
            >
            <!-- 字符串类型值（费用/余额） -->
            <template v-if="typeof card.value === 'string'" #default>
              <span class="stat-string">{{ card.value }}</span>
            </template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <!-- 用量明细 + 余额信息 -->
    <a-row :gutter="16">
      <a-col :span="14">
        <a-card title="Token 用量明细" :bordered="false">
          <a-table
            :data="usageRows()"
            :columns="columns"
            :loading="loading"
            :pagination="false"
            :bordered="false"
            row-key="label"
          />
        </a-card>
      </a-col>
      <a-col :span="10">
        <a-card title="DeepSeek 账户余额" :bordered="false" :loading="loading">
          <template v-if="hasBalanceData() && usageData?.balance?.balance_infos?.[0]">
            <div class="balance-display">
              <div class="balance-total">
                <span class="balance-label">总余额</span>
                <span class="balance-value">¥{{ usageData!.balance!.balance_infos[0].total_balance }}</span>
              </div>
              <a-divider :margin="12" />
              <div class="balance-detail">
                <div class="balance-row">
                  <span>赠送余额</span>
                  <span class="text-muted">¥{{ usageData!.balance!.balance_infos[0].granted_balance }}</span>
                </div>
                <div class="balance-row">
                  <span>充值余额</span>
                  <span class="text-muted">¥{{ usageData!.balance!.balance_infos[0].topped_up_balance }}</span>
                </div>
                <div class="balance-row">
                  <span>账户状态</span>
                  <a-tag :color="usageData!.balance!.is_available ? 'green' : 'red'" size="small">
                    {{ usageData!.balance!.is_available ? "可用" : "余额不足" }}
                  </a-tag>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="chart-placeholder">
            <p style="color: var(--color-text-3)">暂未获取到余额信息</p>
          </div>
        </a-card>

        <!-- 日用量趋势 -->
        <a-card
          v-if="usageData?.daily_usage?.length"
          title="近 30 日 Token 消耗趋势"
          :bordered="false"
          style="margin-top: 16px"
        >
          <div class="trend-chart">
            <div v-for="bar in usageData.daily_usage.slice(-14)" :key="bar.date" class="trend-bar-row">
              <span class="trend-date">{{ bar.date.slice(5) }}</span>
              <div class="trend-bar-track">
                <div class="trend-bar-fill" :style="{ width: barPct(bar.total_tokens) + '%' }"></div>
              </div>
              <span class="trend-count">{{ formatTokens(bar.total_tokens) }}</span>
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Message } from "@arco-design/web-vue";
import { getAIUsage } from "@/api/modules/admin";
import type { DeepSeekUsageResponse, DeepSeekBalance } from "@/api/modules/admin";

// ─── 状态 ──────────────────────────────────────────────────────

const loading = ref(false);
const usageData = ref<DeepSeekUsageResponse | null>(null);

// ─── 汇总指标 ──────────────────────────────────────────────────

const statCards = ref([
  { title: "当月 Token 消耗", value: 0, unit: "tokens", color: "" },
  { title: "当月 API 调用", value: 0, unit: "次", color: "rgb(var(--arcoblue-6))" },
  { title: "估算费用 (当月)", value: "¥0.00", unit: "", color: "rgb(var(--green-6))" },
  { title: "账户余额", value: "¥—", unit: "", color: "" }
]);

// ─── 表格列 ────────────────────────────────────────────────────

const columns = [
  { title: "指标", dataIndex: "label", width: 200 },
  { title: "数值", dataIndex: "value", width: 200 }
];

// ─── 数据加载 ──────────────────────────────────────────────────

async function loadData() {
  loading.value = true;
  try {
    const res = await getAIUsage();
    if (res.code === 0 && res.data) {
      usageData.value = res.data;
      const d = res.data;

      // 汇总指标
      statCards.value[0].value = d.usage_summary.total_tokens;
      statCards.value[1].value = d.usage_summary.total_requests;
      statCards.value[2].value = `¥${d.estimated_cost.total_cost.toFixed(2)}`;
      if (d.balance?.balance_infos?.[0]) {
        statCards.value[3].value = `¥${d.balance.balance_infos[0].total_balance}`;
      } else {
        statCards.value[3].value = "¥—";
      }
    }
  } catch {
    Message.error("加载 DeepSeek 用量数据失败");
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});

// ─── 计算属性 ──────────────────────────────────────────────────

/** 用量明细表格数据 */
const usageRows = (): Array<{ label: string; value: string }> => {
  const d = usageData.value;
  if (!d) return [];

  const rows: Array<{ label: string; value: string }> = [
    { label: "总 Token 消耗（当月）", value: d.usage_summary.total_tokens.toLocaleString() },
    { label: "输入 Token（Prompt）", value: d.usage_summary.total_prompt_tokens.toLocaleString() },
    { label: "输出 Token（Completion）", value: d.usage_summary.total_completion_tokens.toLocaleString() },
    { label: "API 调用次数", value: d.usage_summary.total_requests.toLocaleString() },
    { label: "估算费用（输入）", value: `¥${d.estimated_cost.input_cost.toFixed(2)}` },
    { label: "估算费用（输出）", value: `¥${d.estimated_cost.output_cost.toFixed(2)}` },
    { label: "估算费用（合计）", value: `¥${d.estimated_cost.total_cost.toFixed(2)}` }
  ];

  if (d.balance?.balance_infos?.[0]) {
    const b: DeepSeekBalance = d.balance.balance_infos[0];
    rows.push(
      { label: "账户总余额", value: `¥${b.total_balance}` },
      { label: "赠送余额", value: `¥${b.granted_balance}` },
      { label: "充值余额", value: `¥${b.topped_up_balance}` }
    );
  }

  rows.push({ label: "数据更新时间", value: new Date(d.queried_at).toLocaleString("zh-CN") });

  return rows;
};

const hasBalanceData = (): boolean => {
  return !!usageData.value?.balance?.balance_infos?.length;
};

// ─── 操作 ──────────────────────────────────────────────────────

function handleRefresh() {
  loadData();
}

/** 日趋势柱状图百分比 */
function barPct(tokens: number): number {
  const max = usageData.value?.daily_usage?.reduce((m, d) => Math.max(m, d.total_tokens), 0) ?? 1;
  return Math.round((tokens / Math.max(max, 1)) * 100);
}

/** Token 数格式化 */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
</script>

<style scoped>
.tokens-page {
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

/* ── 字符串类型统计值 ───────────────────────────────────── */

.stat-string {
  font-size: 28px;
  font-weight: 600;
}

/* ── 余额展示 ─────────────────────────────────────────── */

.balance-display {
  padding: 8px 0;
}

.balance-total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.balance-label {
  font-size: 14px;
  color: var(--color-text-2);
}

.balance-value {
  font-size: 24px;
  font-weight: 600;
  color: rgb(var(--green-6));
}

.balance-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.balance-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.text-muted {
  color: var(--color-text-3);
}

/* ── 日趋势柱状图 ─────────────────────────────────────── */

.trend-chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trend-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trend-date {
  width: 44px;
  font-size: 12px;
  color: var(--color-text-3);
  text-align: right;
}

.trend-bar-track {
  flex: 1;
  height: 18px;
  background: var(--color-fill-3);
  border-radius: 3px;
  overflow: hidden;
}

.trend-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, rgb(var(--arcoblue-4)), rgb(var(--arcoblue-6)));
  border-radius: 3px;
  min-width: 2px;
}

.trend-count {
  width: 48px;
  font-size: 12px;
  color: var(--color-text-2);
  text-align: right;
}

/* ── 空数据占位 ──────────────────────────────────────── */

.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
}
</style>
