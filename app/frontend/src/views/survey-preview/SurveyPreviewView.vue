<template>
  <div class="survey-preview">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">问卷预览</h2>
      <p class="page-desc">{{ surveyTitle || "正在加载问卷..." }}</p>
    </div>

    <!-- 加载状态 -->
    <a-spin v-if="loading" :loading="loading" tip="加载中..." class="loading-wrap">
      <div style="min-height: 200px" />
    </a-spin>

    <!-- 空状态 -->
    <a-result v-else-if="!coms.length && !loading" status="404" title="问卷为空" subtitle="该问卷暂未包含任何题目" />

    <!-- 问卷渲染区 -->
    <div v-else class="preview-body">
      <div class="preview-content">
        <component
          :is="componentMap[com.name as keyof typeof componentMap]"
          v-for="(com, index) in paginatedComs"
          :key="com.id || index"
          :status="com.status"
        />
      </div>

      <!-- 分页器 -->
      <div v-if="pageCount > 1" class="pagination-wrap">
        <el-pagination
          v-model:current-page="currentPage"
          background
          layout="prev, pager, next"
          :total="coms.length"
          :page-size="pageSize"
          @current-change="handlePageChange"
        />
      </div>

      <!-- 问卷统计信息 -->
      <div class="preview-footer">
        <a-space>
          <a-tag color="arcoblue">共 {{ coms.length }} 题</a-tag>
          <a-tag v-if="surveyCount" color="green">{{ surveyCount }} 道答题</a-tag>
        </a-space>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { componentMap, useEditorStore, restoreComponentStatus } from "monorepo-survey-engine";
import type { Status } from "monorepo-survey-engine";
import axios from "@/utils/axios";

const route = useRoute();
const store = useEditorStore();

// ── 状态 ────────────────────────────────────────────────────────────────────

const loading = ref(false);
const surveyTitle = ref("");
const pageSize = ref(10);
const currentPage = ref(1);

// 直接使用本地 ref 管理组件数组（避免与 engine store 的内部逻辑耦合）
const coms = ref<Status[]>([]);
const surveyCount = computed(() => store.surveyCount);

// ── 分页计算 ────────────────────────────────────────────────────────────────

const pageCount = computed(() => Math.ceil(coms.value.length / pageSize.value));

const paginatedComs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return coms.value.slice(start, start + pageSize.value);
});

function handlePageChange(page: number) {
  currentPage.value = page;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── 加载问卷数据 ────────────────────────────────────────────────────────────

async function loadSurvey(surveyId: string) {
  loading.value = true;
  try {
    // 假设后端 API: GET /api/survey/:id 返回 { components: Status[], title: string }
    const res: any = await axios.get(`/survey/${surveyId}`);
    const components = res.components || res.coms || [];
    surveyTitle.value = res.title || res.name || `问卷 #${surveyId}`;

    // 处理组件数据并恢复组件引用
    restoreComponentStatus(components as Status[]);
    coms.value = components as Status[];

    // 同步到 engine store
    store.setStore({
      coms: components as Status[],
      surveyCount: components.filter((c: Status) => c.name !== "text-note").length
    });
  } catch (err) {
    console.error("[SurveyPreview] 加载问卷失败:", err);
    surveyTitle.value = "加载失败";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  const surveyId = route.query.id || route.query.surveyId;
  if (surveyId && typeof surveyId === "string") {
    loadSurvey(surveyId);
  }
});
</script>

<style scoped>
.survey-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 900px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 4px;
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

.loading-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
}

.preview-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pagination-wrap {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.preview-footer {
  display: flex;
  justify-content: center;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-2);
}
</style>
