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
      <a-tag v-if="detail" :color="REVIEW_STATUS_COLORS[detail.status]">
        {{ REVIEW_STATUS_LABELS[detail.status] }}
      </a-tag>
    </header>

    <!-- 加载状态 -->
    <a-spin v-if="loading" :loading="loading" tip="正在加载问卷..." class="loading-wrap">
      <div style="min-height: 300px" />
    </a-spin>

    <!-- 错误状态 -->
    <a-result v-else-if="errorMsg" status="error" title="加载失败" :subtitle="errorMsg">
      <template #extra>
        <a-space>
          <a-button type="primary" @click="loadDetail">重试</a-button>
          <a-button @click="goBack">返回列表</a-button>
        </a-space>
      </template>
    </a-result>

    <!-- 空状态 -->
    <a-result
      v-else-if="!loading && !detail"
      status="404"
      title="审核记录未找到"
      subtitle="该审核记录可能已被删除或 ID 不正确"
    >
      <template #extra>
        <a-button type="primary" @click="goBack">返回列表</a-button>
      </template>
    </a-result>

    <!-- 问卷渲染区 -->
    <template v-else-if="detail && coms.length > 0">
      <!-- 审核信息卡片 -->
      <div class="review-info-card">
        <div class="info-row">
          <span class="info-label">提交者：</span>
          <span class="info-value">{{ detail.submitter_name }}</span>
          <a-divider direction="vertical" />
          <span class="info-label">问卷类型：</span>
          <a-tag :color="detail.survey_type === 'template' ? 'arcoblue' : 'gray'" size="small">
            {{ detail.survey_type === "template" ? "模板问卷" : "个人问卷" }}
          </a-tag>
          <a-divider direction="vertical" />
          <span class="info-label">审核状态：</span>
          <a-tag :color="REVIEW_STATUS_COLORS[detail.status]" size="small">
            {{ REVIEW_STATUS_LABELS[detail.status] }}
          </a-tag>
          <a-divider direction="vertical" />
          <span class="info-label">提交时间：</span>
          <span class="info-value">{{ formatDateTime(detail.submitted_at) }}</span>
        </div>
        <div v-if="detail.submit_message" class="info-row">
          <span class="info-label">提交说明：</span>
          <span class="info-value">{{ detail.submit_message }}</span>
        </div>
        <div v-if="detail.review_comment" class="info-row">
          <span class="info-label">审核意见：</span>
          <span class="info-value review-comment">{{ detail.review_comment }}</span>
        </div>
        <div v-if="detail.reviewer_name" class="info-row">
          <span class="info-label">审核人：</span>
          <span class="info-value">{{ detail.reviewer_name }}</span>
          <a-divider direction="vertical" />
          <span class="info-label">审核时间：</span>
          <span class="info-value">{{ formatDateTime(detail.reviewed_at!) }}</span>
        </div>
      </div>

      <!-- 问卷描述 -->
      <div v-if="detail.survey_description" class="survey-description">
        <p class="desc-text">{{ detail.survey_description }}</p>
      </div>

      <!-- 题目数量提示 -->
      <div class="survey-count-bar">
        <span>共 {{ surveyCount }} 道答题</span>
      </div>

      <!-- 问卷内容卡片 -->
      <div class="content-card">
        <div v-for="(com, index) in paginatedComs" :key="com.id || index" class="content-item">
          <component :is="componentMap[com.name as keyof typeof componentMap]" :status="(com as any).status" />
        </div>

        <!-- 分页器 -->
        <div v-if="totalPages > 1" class="pagination-wrap">
          <a-pagination
            v-model:current="currentPage"
            :total="coms.length"
            :page-size="pageSize"
            show-total
            @change="handlePageChange"
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
import { componentMap, useEditorStore, restoreComponentStatus, defaultStatusMap } from "monorepo-survey-engine";
import type { Status } from "monorepo-survey-engine";
import {
  getReviewDetail,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_COLORS,
  type ReviewDetail,
  type ReviewComponentItem
} from "@/api/modules/review";

const route = useRoute();
const router = useRouter();
const store = useEditorStore();

// ── 状态 ──────────────────────────────────────────────────────

const loading = ref(false);
const errorMsg = ref("");
const detail = ref<ReviewDetail | null>(null);
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
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── 将 API 组件数据转为引擎 Status 格式 ────────────────────────

function convertComponents(items: ReviewComponentItem[]): Status[] {
  return items
    .map(item => {
      const factory = defaultStatusMap[item.type.replace(/_/g, "-")];
      if (!factory) {
        console.warn(`[SurveyDetail] 未知组件类型: ${item.type}，跳过渲染`);
        return null;
      }
      const status = factory();
      status.id = item.id;
      // 合并 API 返回的 config 到 status 中（覆盖默认值）
      if (item.config && typeof item.config === "object") {
        for (const key of Object.keys(item.config)) {
          if (key in status.status) {
            (status.status[key] as unknown as Record<string, unknown>).status =
              (item.config[key] as Record<string, unknown>)?.status ?? item.config[key];
          }
        }
      }
      return status;
    })
    .filter((s): s is Status => s !== null);
}

// ── 加载审核详情 ──────────────────────────────────────────────

async function loadDetail() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const reviewId = route.params.id as string;
    const res = await getReviewDetail(reviewId);
    if (!res.data) {
      detail.value = null;
      surveyTitle.value = "审核记录未找到";
      return;
    }

    detail.value = res.data;
    surveyTitle.value = res.data.survey_title;

    // 转换组件数据为引擎可渲染的 Status 格式
    const components = convertComponents(res.data.components);
    restoreComponentStatus(components);
    coms.value = components;

    // 同步到 engine store（直接赋值避免 SurveyDBData 类型不匹配）
    store.coms = components;
    store.surveyCount = components.filter(c => c.name !== "text-note").length;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "加载审核详情失败";
    detail.value = null;
  } finally {
    loading.value = false;
  }
}

// ── 导航 ──────────────────────────────────────────────────────

function goBack() {
  window.close();
  setTimeout(() => {
    router.push({ name: "surveyPreview" });
  }, 200);
}

onMounted(() => {
  const reviewId = route.params.id as string;
  if (reviewId) {
    loadDetail();
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

/* ── 审核信息卡片 ──────────────────────────────────────── */
.review-info-card {
  max-width: 800px;
  width: 100%;
  margin: 20px auto 0;
  padding: 16px 24px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.06);
}

.info-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  font-size: 13px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  color: #71717a;
}

.info-value {
  color: #3f3f46;
}

.review-comment {
  color: #e53e3e;
  font-weight: 500;
}

/* ── 问卷描述卡片 ──────────────────────────────────────── */
.survey-description {
  max-width: 800px;
  width: 100%;
  margin: 16px auto 0;
  padding: 16px 24px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.06);
}

.desc-text {
  margin: 0;
  font-size: 14px;
  color: #3f3f46;
  line-height: 1.7;
}

/* ── 题目数量提示 ──────────────────────────────────────── */
.survey-count-bar {
  max-width: 800px;
  width: 100%;
  margin: 16px auto 0;
  font-size: 13px;
  color: #71717a;
}

/* ── 问卷内容卡片 ──────────────────────────────────────── */
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
