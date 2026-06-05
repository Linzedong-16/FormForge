<template>
  <div class="tokens-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="title-area">
        <h2 class="page-title">API Token 用量统计与管理</h2>
        <p class="page-desc">管理问卷平台 API 访问凭证，监控用量消耗与配额</p>
      </div>
      <a-button type="primary" @click="handleCreateToken">
        <template #icon><icon-plus /></template>
        创建 Token
      </a-button>
    </div>

    <!-- 用量汇总 -->
    <a-row :gutter="16">
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="Token 总数" :value="8" :value-style="{ fontSize: '28px' }" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic
            title="本月调用总量"
            :value="18920"
            :value-style="{ fontSize: '28px', color: 'rgb(var(--arcoblue-6))' }"
          >
            <template #suffix><span class="stat-unit">次</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic
            title="月配额剩余"
            :value="81080"
            :value-style="{ fontSize: '28px', color: 'rgb(var(--green-6))' }"
          >
            <template #suffix><span class="stat-unit">次</span></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" class="stat-card">
          <a-statistic title="配额使用率" :value="18.9" :precision="1" :value-style="{ fontSize: '28px' }">
            <template #suffix><span class="stat-unit">%</span></template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <!-- 用量趋势图 -->
    <a-row :gutter="16">
      <a-col :span="16">
        <a-card title="近 30 日 API 调用量趋势" :bordered="false">
          <div class="chart-placeholder">
            <icon-bar-chart class="placeholder-icon" />
            <p>API 调用量折线图（集成图表库后展示）</p>
          </div>
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card title="各 Token 用量占比" :bordered="false">
          <div class="chart-placeholder small">
            <icon-lock class="placeholder-icon" />
            <p>用量占比饼图（集成图表库后展示）</p>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <!-- Token 列表 -->
    <a-card title="Token 列表" :bordered="false">
      <a-table :data="tokens" :columns="columns" :pagination="{ pageSize: 8, showTotal: true }" row-key="id">
        <!-- Token 值（脱敏展示） -->
        <template #tokenValue="{ record }">
          <a-space>
            <span class="token-mask">{{ record.tokenMask }}</span>
            <a-button type="text" size="mini" @click="handleCopyToken(record)">复制</a-button>
          </a-space>
        </template>
        <!-- 状态 -->
        <template #status="{ record }">
          <a-switch
            :model-value="record.status === 'active'"
            size="small"
            @change="val => handleToggleStatus(record, val)"
          />
        </template>
        <!-- 用量进度 -->
        <template #usage="{ record }">
          <div class="rate-cell">
            <a-progress
              :percent="record.usageRate / 100"
              :stroke-width="6"
              :show-text="false"
              :status="record.usageRate > 80 ? 'danger' : 'normal'"
              animation
            />
            <span class="rate-text">{{ record.usageRate }}%</span>
          </div>
        </template>
        <!-- 操作 -->
        <template #operations="{ record }">
          <a-space>
            <a-button type="text" size="small" @click="handleViewUsage(record)">用量详情</a-button>
            <a-popconfirm content="确认吊销该 Token？此操作不可恢复。" @ok="handleRevoke(record)">
              <a-button type="text" size="small" status="danger">吊销</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Message } from "@arco-design/web-vue";

interface TokenItem {
  id: string;
  name: string;
  tokenMask: string;
  monthlyQuota: number;
  usedCount: number;
  usageRate: number;
  status: "active" | "disabled";
  createdAt: string;
  lastUsed: string;
}

const columns = [
  { title: "名称", dataIndex: "name", width: 160 },
  { title: "Token", dataIndex: "tokenValue", slotName: "tokenValue", width: 200 },
  { title: "月配额", dataIndex: "monthlyQuota", width: 100 },
  { title: "本月已用", dataIndex: "usedCount", width: 100 },
  { title: "用量占比", dataIndex: "usage", slotName: "usage", width: 160 },
  { title: "启用", dataIndex: "status", slotName: "status", width: 70 },
  { title: "创建时间", dataIndex: "createdAt", width: 160 },
  { title: "最后使用", dataIndex: "lastUsed", width: 160 },
  { title: "操作", slotName: "operations", width: 150 }
];

// 占位数据
const tokens = ref<TokenItem[]>([
  {
    id: "t001",
    name: "前端生产环境",
    tokenMask: "sk-prod-****...****a1b2",
    monthlyQuota: 50000,
    usedCount: 12430,
    usageRate: 24,
    status: "active",
    createdAt: "2024-10-01 09:00",
    lastUsed: "2024-12-05 10:22"
  },
  {
    id: "t002",
    name: "数据分析服务",
    tokenMask: "sk-ana-****...****c3d4",
    monthlyQuota: 30000,
    usedCount: 6490,
    usageRate: 21,
    status: "active",
    createdAt: "2024-11-01 10:00",
    lastUsed: "2024-12-05 09:45"
  },
  {
    id: "t003",
    name: "测试环境 Token",
    tokenMask: "sk-test-****...****e5f6",
    monthlyQuota: 10000,
    usedCount: 8920,
    usageRate: 89,
    status: "active",
    createdAt: "2024-09-15 14:30",
    lastUsed: "2024-12-05 08:10"
  },
  {
    id: "t004",
    name: "已停用的旧 Token",
    tokenMask: "sk-old-****...****g7h8",
    monthlyQuota: 10000,
    usedCount: 0,
    usageRate: 0,
    status: "disabled",
    createdAt: "2024-06-01 11:00",
    lastUsed: "2024-09-30 17:00"
  }
]);

const handleCreateToken = () => {
  // TODO: 打开创建 Token 弹窗
  Message.info("创建 Token 功能开发中");
};

const handleCopyToken = (record: TokenItem) => {
  Message.success(`${record.name} Token 已复制到剪贴板`);
};

const handleToggleStatus = (record: TokenItem, val: boolean | (string | number | boolean)) => {
  record.status = val ? "active" : "disabled";
  Message.success(`Token「${record.name}」已${val ? "启用" : "停用"}`);
};

const handleViewUsage = (record: TokenItem) => {
  Message.info(`查看用量详情：${record.name}`);
};

const handleRevoke = (record: TokenItem) => {
  tokens.value = tokens.value.filter(t => t.id !== record.id);
  Message.success(`Token「${record.name}」已吊销`);
};
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

.chart-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--color-text-4);
  font-size: 14px;
}

.chart-placeholder.small {
  height: 180px;
}

.placeholder-icon {
  font-size: 48px;
  color: var(--color-fill-3);
  margin-bottom: 12px;
}

/* Token 脱敏文本 */
.token-mask {
  font-family: "Courier New", monospace;
  font-size: 13px;
  color: var(--color-text-2);
  letter-spacing: 0.5px;
}

.rate-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rate-text {
  font-size: 13px;
  color: var(--color-text-2);
  width: 40px;
  text-align: right;
}
</style>
