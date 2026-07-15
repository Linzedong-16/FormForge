<template>
  <div class="template-market">
    <!-- 搜索栏 -->
    <div class="search-bar">
      <el-input
        v-model="keyword"
        :placeholder="tm('searchPlaceholder')"
        clearable
        size="small"
        @keyup.enter="doSearch"
        @clear="doSearch"
      >
        <template #suffix>
          <el-icon class="el-input__icon" @click="doSearch"><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- 分类筛选 -->
    <div class="category-tabs">
      <el-radio-group v-model="category" size="small" @change="onFilterChange">
        <el-radio-button value="">{{ tm("categoryAll") }}</el-radio-button>
        <el-radio-button value="education">{{ tm("categoryEducation") }}</el-radio-button>
        <el-radio-button value="market">{{ tm("categoryMarket") }}</el-radio-button>
        <el-radio-button value="hr">{{ tm("categoryHr") }}</el-radio-button>
        <el-radio-button value="customer">{{ tm("categoryCustomer") }}</el-radio-button>
        <el-radio-button value="event">{{ tm("categoryEvent") }}</el-radio-button>
        <el-radio-button value="other">{{ tm("categoryOther") }}</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 排序 -->
    <div class="sort-bar">
      <span class="sort-label">{{ tm("sortLabel") }}</span>
      <el-radio-group v-model="sort" size="small" @change="onFilterChange">
        <el-radio-button value="newest">{{ tm("sortNewest") }}</el-radio-button>
        <el-radio-button value="popular">{{ tm("sortPopular") }}</el-radio-button>
        <el-radio-button value="rating">{{ tm("sortRating") }}</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 模板列表 -->
    <div v-if="loading" class="loading-container">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon>
      <span class="ml-10">{{ tm("loading") }}</span>
    </div>

    <div v-else-if="error" class="error-container">
      <el-icon :size="24"><WarningFilled /></el-icon>
      <span class="ml-10">{{ error }}</span>
      <el-button size="small" class="ml-10" @click="fetchTemplates">{{ tm("retry") }}</el-button>
    </div>

    <div v-else-if="templates.length === 0" class="empty-container">
      <el-empty :description="tm('emptyHint')" :image-size="80" />
    </div>

    <div v-else class="template-list">
      <div v-for="item in templates" :key="item.id" class="template-card" @click="showDetail(item)">
        <div class="card-header">
          <el-tag :type="categoryTagType(item.category)" size="small" effect="plain">
            {{ categoryLabel(item.category) }}
          </el-tag>
          <span class="download-count">
            <el-icon><Download /></el-icon>
            {{ item.download_count }}
          </span>
        </div>
        <h3 class="card-title">{{ item.title }}</h3>
        <p class="card-desc">{{ item.description || tm("noDescription") }}</p>
        <div class="card-footer">
          <el-rate
            v-model="item._ratingNum"
            disabled
            :max="5"
            size="small"
            show-score
            :score-template="item.rating ?? '0'"
          />
          <span class="card-date">{{ formatDate(item.created_at) }}</span>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="total > pageSize" class="pagination-bar">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        background
        size="small"
        @current-change="fetchTemplates"
      />
    </div>

    <!-- 模板详情弹窗 -->
    <!-- append-to-body：挂载到 body，避免嵌套在带 backdrop-filter 的 .left-side-container 内时，
         其 fixed 定位被 backdrop-filter 创建的新 containing block 影响而错位 -->
    <el-dialog
      v-model="detailVisible"
      :title="selectedTemplate?.title || tm('detailTitle')"
      width="680px"
      destroy-on-close
      append-to-body
    >
      <template v-if="selectedTemplate">
        <div class="detail-body">
          <div class="detail-meta">
            <el-tag :type="categoryTagType(selectedTemplate.category)" size="small" effect="plain">
              {{ categoryLabel(selectedTemplate.category) }}
            </el-tag>
            <span class="meta-item">
              <el-icon><Download /></el-icon>
              {{ selectedTemplate.download_count }} {{ tm("useCount") }}
            </span>
            <span class="meta-item">
              <el-rate v-model="selectedTemplate._ratingNum" disabled :max="5" size="small" show-score />
            </span>
            <span class="meta-item">{{ formatDate(selectedTemplate.created_at) }}</span>
          </div>

          <p class="detail-desc">{{ selectedTemplate.description || tm("noDescription") }}</p>

          <!-- 组件预览 -->
          <div v-if="selectedTemplate.components?.length" class="component-preview">
            <h4>{{ tm("componentPreview") }} ({{ selectedTemplate.components.length }})</h4>
            <div class="component-list">
              <div v-for="(comp, idx) in selectedTemplate.components" :key="comp.id" class="component-item">
                <span class="comp-index">{{ idx + 1 }}.</span>
                <el-tag size="small" type="info">{{ comp.type }}</el-tag>
                <span v-if="comp.required" class="comp-required">{{ tm("required") }}</span>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="detail-actions">
            <el-button type="primary" :loading="applying" @click="useTemplateBtn">
              <el-icon><Plus /></el-icon>
              {{ tm("useTemplate") }}
            </el-button>

            <!-- 评分 -->
            <div class="rate-section">
              <span class="rate-label">{{ tm("yourRating") }}</span>
              <el-rate v-model="userRating" :max="5" @change="onRateTemplate" />
            </div>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, type Ref } from "vue";
import { Search, Download, Plus, Loading, WarningFilled } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";
import {
  getTemplateList,
  getTemplateDetail,
  rateTemplate as rateTemplateApi,
  deserializeSurveyDetail
} from "@/api/modules/survey";
import { restoreComponentStatus } from "@/utils";
import type {
  TemplateListItem,
  TemplateDetail,
  TemplateListQuery,
  TemplateCategory
} from "@common/survey/survey.interface";
import { useEditorStore } from "@/stores/useEditor";

const { t } = useI18n();
const store = useEditorStore();

/** 模板市场 i18n 快捷访问：t('editor.template.xxx') */
const tm = (key: string) => t(`editor.template.${key}`);

// ─── 筛选参数 ──────────────────────────────────────────────────

const keyword = ref("");
const category: Ref<string> = ref("");
const sort: Ref<"newest" | "popular" | "rating"> = ref("newest");
const page = ref(1);
const pageSize = 12;

// ─── 数据状态 ──────────────────────────────────────────────────

const loading = ref(false);
const error = ref("");
const templates = ref<Array<TemplateListItem & { _ratingNum: number }>>([]);
const total = ref(0);

// ─── 详情弹窗 ──────────────────────────────────────────────────

const detailVisible = ref(false);
const selectedTemplate = ref<(TemplateDetail & { _ratingNum: number }) | null>(null);
const applying = ref(false);
const userRating = ref(0);

// ─── 分类映射 ──────────────────────────────────────────────────

const categoryTagType = (cat: string | null): "success" | "warning" | "danger" | "" | "info" | "primary" => {
  const map: Record<string, "success" | "warning" | "danger" | "" | "info" | "primary"> = {
    education: "success",
    market: "warning",
    hr: "danger",
    customer: "primary",
    event: "success",
    other: "info"
  };
  return cat ? (map[cat] ?? "info") : "info";
};

const categoryLabel = (cat: string | null): string => {
  const key = cat
    ? `editor.template.category${cat.charAt(0).toUpperCase() + cat.slice(1)}`
    : "editor.template.categoryOther";
  return t(key);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ─── 数据获取 ──────────────────────────────────────────────────

const fetchTemplates = async () => {
  loading.value = true;
  error.value = "";

  try {
    const params: TemplateListQuery = {
      page: page.value,
      page_size: pageSize,
      sort: sort.value
    };
    if (category.value) params.category = category.value as TemplateCategory;
    if (keyword.value.trim()) params.keyword = keyword.value.trim();

    const res = await getTemplateList(params);
    if (res.code === 0 && res.data) {
      const realList = (res.data.templates ?? []).map(item => ({
        ...item,
        _ratingNum: item.rating ? parseFloat(item.rating) : 0
      }));
      templates.value = realList;
      total.value = res.data.total ?? 0;
    } else {
      error.value = res.msg || tm("fetchFailed");
    }
  } catch (err: any) {
    error.value = err?.message || err?.response?.data?.msg || tm("fetchFailed");
  } finally {
    loading.value = false;
  }
};

// ─── 搜索 / 筛选 ──────────────────────────────────────────────

const doSearch = () => {
  page.value = 1;
  fetchTemplates();
};

const onFilterChange = () => {
  page.value = 1;
  fetchTemplates();
};

// ─── 模板详情 ──────────────────────────────────────────────────

const showDetail = async (item: TemplateListItem) => {
  try {
    const res = await getTemplateDetail(item.id);
    if (res.code === 0 && res.data) {
      selectedTemplate.value = {
        ...res.data,
        _ratingNum: res.data.rating ? parseFloat(res.data.rating) : 0
      };
      userRating.value = 0;
      detailVisible.value = true;
    } else {
      ElMessage.error(res.msg || tm("fetchDetailFailed"));
    }
  } catch (err: any) {
    ElMessage.error(err?.message || err?.response?.data?.msg || tm("fetchDetailFailed"));
  }
};

// ─── 使用模板填充编辑器 ──────────────────────────────────────

const useTemplateBtn = async () => {
  if (!selectedTemplate.value) return;
  applying.value = true;

  try {
    // 调用后端查询问卷详情 API，获取模板完整组件数据
    const res = await getTemplateDetail(selectedTemplate.value.id);
    if (res.code !== 0 || !res.data) {
      ElMessage.error(res.msg || tm("useTemplateFailed"));
      return;
    }

    const rawComponents = (res.data as any).components;
    if (!rawComponents || rawComponents.length === 0) {
      ElMessage.warning(tm("noComponents"));
      return;
    }

    // 反序列化：后端 SurveyComponentDetail（snake_case + config JSON）→ 编辑器 Status[]（kebab-case + status）
    const deserialized = deserializeSurveyDetail(rawComponents);
    // 补充 id 字段（deserialize 产出 _componentId），restoreComponentStatus 需要 name 挂载 type
    const coms = deserialized.map(c => ({
      ...c,
      id: c._componentId
    }));
    restoreComponentStatus(coms);

    // 将模板组件填充到当前编辑器（不创建远程记录、不同步、不持久化）
    // 定位是快速搭建定制问卷的起点，用户可在此基础上修缮后手动保存
    store.setStore(
      {
        coms,
        surveyCount: coms.filter((c: any) => c.name !== "text-note").length,
        currentPage: 1,
        pageSize: 10
      } as any,
      undefined
    );

    detailVisible.value = false;
    ElMessage.success(tm("useTemplateSuccess"));
  } catch (err: any) {
    ElMessage.error(err?.message || tm("useTemplateFailed"));
  } finally {
    applying.value = false;
  }
};

// ─── 模板评分 ──────────────────────────────────────────────────

const onRateTemplate = async (score: number) => {
  if (!selectedTemplate.value || score === 0) return;

  try {
    const res = await rateTemplateApi(selectedTemplate.value.id, { score });
    if (res.code === 0) {
      selectedTemplate.value._ratingNum = parseFloat(res.data.rating);
      ElMessage.success(tm("rateSuccess"));
    } else {
      ElMessage.error(res.msg || tm("rateFailed"));
    }
  } catch (err: any) {
    ElMessage.error(err?.message || err?.response?.data?.msg || tm("rateFailed"));
  }
};

// ─── 生命周期 ──────────────────────────────────────────────────

onMounted(() => {
  fetchTemplates();
});
</script>

<style scoped lang="scss">
.template-market {
  height: calc(100vh - 50px - 40px - 50px);
  display: flex;
  flex-direction: column;
}

.search-bar {
  margin-bottom: 12px;
}

.category-tabs {
  margin-bottom: 8px;

  :deep(.el-radio-group) {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
}

.sort-bar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;

  .sort-label {
    font-size: var(--font-size-sm);
    color: var(--font-color-light);
    margin-right: 8px;
    white-space: nowrap;
  }
}

.loading-container,
.error-container,
.empty-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--font-color-light);
  font-size: var(--font-size-base);
}

.error-container {
  color: var(--error-color);
}

.template-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  /* 瀑布流：CSS 多列布局，卡片高度自然变化 */
  columns: 2;
  column-gap: 8px;
}

.template-card {
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--white);
  display: flex;
  flex-direction: column;
  /* 防止卡片在列之间断裂 */
  break-inside: avoid;
  margin-bottom: 8px;

  &:hover {
    border-color: var(--primary-color);
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;

    .download-count {
      font-size: var(--font-size-xs);
      color: var(--font-color-light);
      display: flex;
      align-items: center;
      gap: 2px;
    }
  }

  .card-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--font-color-primary);
    margin: 0 0 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-desc {
    font-size: 11px;
    color: var(--font-color-light);
    margin: 0 0 6px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    line-height: 1.5;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;

    .card-date {
      font-size: 11px;
      color: var(--font-color-placeholder);
    }
  }
}

.pagination-bar {
  margin-top: 10px;
  display: flex;
  justify-content: center;
}

// ─── 详情弹窗 ──────────────────────────────────────────────────

.detail-body {
  .detail-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;

    .meta-item {
      font-size: var(--font-size-sm);
      color: var(--font-color-light);
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }

  .detail-desc {
    font-size: var(--font-size-base);
    color: var(--font-color-regular);
    line-height: 1.6;
    margin-bottom: 16px;
  }

  .component-preview {
    margin-bottom: 16px;

    h4 {
      font-size: var(--font-size-base);
      font-weight: 500;
      margin: 0 0 8px;
    }

    .component-list {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-sm);
      padding: 8px;
    }

    .component-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;

      .comp-index {
        font-size: var(--font-size-xs);
        color: var(--font-color-light);
        min-width: 20px;
      }

      .comp-required {
        font-size: var(--font-size-xs);
        color: var(--error-color);
      }
    }
  }

  .detail-actions {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color);

    .rate-section {
      display: flex;
      align-items: center;
      gap: 8px;

      .rate-label {
        font-size: var(--font-size-sm);
        color: var(--font-color-light);
        white-space: nowrap;
      }
    }
  }
}
</style>
