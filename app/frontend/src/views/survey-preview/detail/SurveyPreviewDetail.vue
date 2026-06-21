<template>
  <div class="survey-detail-page">
    <!-- 顶部导航栏 -->
    <header class="detail-header">
      <a-button type="text" size="small" @click="goBack">
        <template #icon><icon-left /></template>
        返回列表
      </a-button>
      <span class="header-divider">|</span>
      <span class="header-title">{{ surveyTitle || "加载中..." }}</span>
      <a-tag v-if="detail" :color="REVIEW_STATUS_COLORS[detail.reviewStatus]">
        {{ REVIEW_STATUS_LABELS[detail.reviewStatus] }}
      </a-tag>
    </header>

    <!-- 加载状态 -->
    <a-spin v-if="loading" :loading="loading" tip="正在加载问卷..." class="loading-wrap">
      <div style="min-height: 300px" />
    </a-spin>

    <!-- 空状态 -->
    <a-result v-else-if="!loading && !detail" status="404" title="问卷未找到" subtitle="该问卷可能已被删除或 ID 不正确">
      <template #extra>
        <a-button type="primary" @click="goBack">返回列表</a-button>
      </template>
    </a-result>

    <!-- 问卷渲染区 -->
    <template v-else-if="detail && coms.length > 0">
      <!-- 问卷描述 -->
      <div class="survey-description">
        <p class="desc-text">{{ detail.description }}</p>
        <div class="survey-meta">
          <a-tag color="arcoblue" size="small">{{ detail.surveyType === "template" ? "模板问卷" : "个人问卷" }}</a-tag>
          <a-tag size="small">{{ coms.length }} 题</a-tag>
          <span class="meta-text">作者：{{ detail.author }}</span>
          <span class="meta-text">更新于 {{ formatDateTime(detail.updatedAt) }}</span>
        </div>
      </div>

      <!-- 题目数量提示 -->
      <div class="survey-count-bar">
        <span>共 {{ surveyCount }} 道答题</span>
      </div>

      <!-- 问卷内容卡片 -->
      <div class="content-card">
        <div v-for="(com, index) in paginatedComs" :key="com.id || index" class="content-item">
          <component :is="componentMap[com.name as keyof typeof componentMap]" :status="com.status" />
        </div>

        <!-- 分页器 -->
        <div v-if="totalPages > 1" class="pagination-wrap">
          <el-pagination
            v-model:current-page="currentPage"
            background
            layout="prev, pager, next"
            :total="coms.length"
            :page-size="pageSize"
            @current-change="handlePageChange"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconLeft } from "@arco-design/web-vue/es/icon";
import { componentMap, useEditorStore, restoreComponentStatus } from "monorepo-survey-engine";
import type { Status } from "monorepo-survey-engine";
import {
  getMockSurveyDetail,
  mockDelay,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_COLORS,
  type MockSurveyDetail
} from "@/api/modules/survey-preview/mockData";

const route = useRoute();
const router = useRouter();
const store = useEditorStore();

// ── 状态 ──────────────────────────────────────────────────────

const loading = ref(false);
const detail = ref<MockSurveyDetail | null>(null);
const surveyTitle = ref("");
const pageSize = ref(10);
const currentPage = ref(1);

const coms = ref<Status[]>([]);
const surveyCount = computed(() => store.surveyCount);

// ── 分页计算 ──────────────────────────────────────────────────

const totalPages = computed(() => Math.ceil(coms.value.length / pageSize.value));

const paginatedComs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return coms.value.slice(start, start + pageSize.value);
});

function handlePageChange(page: number) {
  currentPage.value = page;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── 格式化日期 ────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── 加载问卷详情 ──────────────────────────────────────────────

async function loadSurveyDetail(surveyId: string) {
  loading.value = true;
  try {
    // 模拟网络延迟
    await mockDelay(500);
    const data = getMockSurveyDetail(surveyId);
    if (!data) {
      detail.value = null;
      surveyTitle.value = "问卷未找到";
      return;
    }

    detail.value = data;
    surveyTitle.value = data.title;

    // 恢复组件引用并设置渲染数据
    const components = data.components;
    restoreComponentStatus(components);
    coms.value = components;

    // 同步到 engine store
    store.setStore({
      coms: components,
      surveyCount: components.filter((c: Status) => c.name !== "text-note").length
    });
  } catch (err) {
    console.error("[SurveyDetail] 加载问卷详情失败:", err);
    detail.value = null;
    surveyTitle.value = "加载失败";
  } finally {
    loading.value = false;
  }
}

// ── 导航 ──────────────────────────────────────────────────────

function goBack() {
  // 尝试关闭标签页（适用于 window.open 打开的），否则跳回列表
  window.close();
  // 如果浏览器阻止关闭（非脚本打开的标签页），延迟跳回列表
  setTimeout(() => {
    router.push({ name: "surveyPreview" });
  }, 200);
}

onMounted(() => {
  const surveyId = route.params.id as string;
  if (surveyId) {
    loadSurveyDetail(surveyId);
  }
});
</script>

<style scoped>
/* ── 页面容器 ──────────────────────────────────────────── */
.survey-detail-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-bottom: 40px;
  background: var(--color-fill-2);
}

/* ── 顶部导航栏 ────────────────────────────────────────── */
.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid var(--color-border-2);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.header-divider {
  color: var(--color-border-2);
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-1);
  flex: 1;
}

/* ── 加载 ──────────────────────────────────────────────── */
.loading-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
}

/* ── 问卷描述卡片 ──────────────────────────────────────── */
.survey-description {
  max-width: 800px;
  width: 100%;
  margin: 20px auto 0;
  padding: 16px 24px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.06);
}

.desc-text {
  margin: 0 0 10px;
  font-size: 14px;
  color: #3f3f46;
  line-height: 1.7;
}

.survey-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-text {
  font-size: 12px;
  color: #a1a1aa;
}

/* ── 题目数量提示 ──────────────────────────────────────── */
.survey-count-bar {
  max-width: 800px;
  width: 100%;
  margin: 16px auto 0;
  font-size: 13px;
  color: #71717a;
}

/* ── 问卷内容卡片（参照 q-editor 预览样式） ────────────── */
.content-card {
  max-width: 800px;
  width: 100%;
  margin: 8px auto 0;
  padding: 24px 28px;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.08);
}

.content-item {
  margin-bottom: 12px;
}

.content-item:last-child {
  margin-bottom: 0;
}

/* ── 分页器 ────────────────────────────────────────────── */
.pagination-wrap {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f4f4f5;
}
</style>
