<template>
  <div class="layout-page pt-20 pb-20 pl-20 pr-20">
    <headerNav>
      <template #left>
        <el-button :icon="ArrowLeft" circle size="small" @click="goLand" />
      </template>
    </headerNav>
    <h1 class="font-weight-100 text-center">{{ t("layout.pageTitle") }}</h1>
    <!-- 按钮组 -->
    <div class="mb-15">
      <el-button type="primary" :icon="Plus" @click="goToEditor">{{ t("layout.createSurvey") }}</el-button>
      <el-button type="success" :icon="Compass" @click="goToComMarket">{{ t("layout.componentMarket") }}</el-button>
      <span v-if="remoteLoading" class="ml-10 sync-hint">
        <el-icon class="is-loading"
          ><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
            <path
              d="M512 64a448 448 0 1 0 448 448A448 448 0 0 0 512 64zm0 832a384 384 0 1 1 384-384 384 384 0 0 1-384 384z"
              fill="currentColor"
            />
            <path
              d="M512 128a32 32 0 0 0-32 32v256a32 32 0 0 0 32 32h256a32 32 0 0 0 0-64H544V160a32 32 0 0 0-32-32z"
              fill="currentColor"
            /></svg
        ></el-icon>
        {{ t("layout.syncingRemote") }}
      </span>
      <span v-if="remoteSyncFailed" class="ml-10 sync-hint sync-hint--error">
        {{ t("layout.syncFailedHint") }}
      </span>
    </div>
    <!-- 数据表格 + 分页：包裹在 table-area 中作为唯一的弹性伸缩区域，
         使其随视口高度自动伸缩，多出的行交由 el-table 自身内部滚动承担，
         从而避免整页因内容超出一屏而出现浏览器级滚动条 -->
    <div class="table-area">
      <div class="table-wrap">
        <el-table :data="pagedTableData" style="width: 100%" border height="100%" @sort-change="handleSortChange">
          <el-table-column
            fixed
            prop="createDate"
            :label="t('layout.columnCreateDate')"
            width="150"
            sortable="custom"
            :formatter="formatDate"
          />
          <el-table-column prop="syncStatus" :label="t('layout.columnSyncStatus')" width="100" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.syncStatus === 'synced' ? 'success' : 'info'" size="small" effect="plain">
                {{ scope.row.syncStatus === "synced" ? t("layout.statusSynced") : t("layout.statusUnsynced") }}
              </el-tag>
            </template>
          </el-table-column>
          <!-- 审核状态 -->
          <el-table-column :label="t('layout.columnReviewStatus')" width="90" align="center">
            <template #default="scope">
              <template v-if="scope.row.review_status && scope.row.syncStatus === 'synced'">
                <el-tag :type="reviewStatusType(scope.row.review_status)" size="small" effect="plain">
                  {{ t("layout.reviewStatus." + scope.row.review_status) }}
                </el-tag>
              </template>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="title" :label="t('layout.columnTitle')">
            <template #default="scope">
              <span class="survey-title-link" @click="viewSurvey(scope.row)">{{ scope.row.title }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="surveyCount" :label="t('layout.columnQuestionCount')" width="150" align="center" />
          <el-table-column
            prop="updateDate"
            :label="t('layout.columnUpdateDate')"
            width="150"
            align="center"
            sortable="custom"
            :formatter="formatDate"
          />
          <!-- 不满足条件的按钮直接不渲染（不留空位），列宽按最多同时出现的按钮数预留，避免右侧被裁切 -->
          <el-table-column
            fixed="right"
            :label="t('layout.columnAction')"
            width="230"
            align="left"
            header-align="center"
          >
            <template #default="scope">
              <!-- 圆形图标按钮：hover 显示原文字含义的 tooltip，避免文字撑宽操作列 -->
              <div class="action-icons">
                <!-- 同步用主色（--el-color-primary）强调，与编辑按钮的中性灰区分；
                 主色随亮暗主题与色弱模式自动切换到可辨色，无需再单独硬编码颜色 -->
                <el-tooltip :content="t('layout.syncSurvey')" placement="top">
                  <el-button
                    circle
                    type="primary"
                    size="small"
                    :icon="Refresh"
                    :loading="syncingId === scope.row.id"
                    @click="syncSurvey(scope.row)"
                  />
                </el-tooltip>
                <!-- disabled 状态下原生按钮不响应 hover 事件，外面套一层 span 承接 tooltip 触发 -->
                <el-tooltip
                  v-if="scope.row.remote_survey_id && scope.row.review_status !== 'approved'"
                  :content="scope.row.review_status === 'pending' ? t('layout.reviewing') : t('layout.submitReview')"
                  placement="top"
                >
                  <span>
                    <el-button
                      circle
                      type="warning"
                      size="small"
                      :icon="Promotion"
                      :disabled="scope.row.review_status === 'pending'"
                      @click="handleSubmitForReview(scope.row)"
                    />
                  </span>
                </el-tooltip>
                <el-tooltip
                  v-if="
                    scope.row.remote_survey_id &&
                    scope.row.review_status === 'approved' &&
                    scope.row.syncStatus === 'synced'
                  "
                  :content="t('layout.shareTemplate')"
                  placement="top"
                >
                  <el-button circle type="success" size="small" :icon="Share" @click="handleShareTemplate(scope.row)" />
                </el-tooltip>
                <!-- 生成问卷链接：仅在已同步且审核通过后可用 -->
                <el-tooltip
                  v-if="
                    scope.row.remote_survey_id &&
                    scope.row.review_status === 'approved' &&
                    scope.row.syncStatus === 'synced'
                  "
                  :content="t('layout.generateLink')"
                  placement="top"
                >
                  <el-button circle type="warning" size="small" :icon="Link" @click="handleGenerateLink(scope.row)" />
                </el-tooltip>
                <!-- 编辑为常规操作，用中性灰即可，突出的主色只留给醒目的删除/审核类操作 -->
                <el-tooltip :content="t('layout.edit')" placement="top">
                  <el-button circle type="info" size="small" :icon="Edit" @click="editSurvey(scope.row)" />
                </el-tooltip>
                <el-tooltip :content="t('layout.delete')" placement="top">
                  <el-button circle type="danger" size="small" :icon="Delete" @click="handleDeleteSurvey(scope.row)" />
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <!-- 分页器 -->
      <div class="table-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="tableData.length"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </div>

    <!-- 申请共享模板对话框 -->
    <el-dialog v-model="templateDialogVisible" :title="t('layout.shareTemplateTitle')" width="500px">
      <el-form :model="templateForm" label-width="100px">
        <el-form-item :label="t('layout.templateCategory')" required>
          <el-select
            v-model="templateForm.category"
            :placeholder="t('layout.templateCategoryRequired')"
            style="width: 100%"
          >
            <el-option :label="t('layout.templateCategoryEducation')" value="education" />
            <el-option :label="t('layout.templateCategoryMarket')" value="market" />
            <el-option :label="t('layout.templateCategoryHr')" value="hr" />
            <el-option :label="t('layout.templateCategoryCustomer')" value="customer" />
            <el-option :label="t('layout.templateCategoryEvent')" value="event" />
            <el-option :label="t('layout.templateCategoryOther')" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('layout.templateSubmitMessage')">
          <el-input
            v-model="templateForm.submit_message"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            :placeholder="t('layout.templateSubmitMessage')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDialogVisible = false">{{ t("layout.cancel") }}</el-button>
        <el-button type="primary" :loading="templateApplying" @click="submitApplyTemplate">
          {{ t("layout.templateSubmit") }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 生成问卷链接对话框 -->
    <GenerateLinkDialog
      v-model="generateLinkDialogVisible"
      :survey-id="generateLinkSurveyId"
      @generated="onLinkGenerated"
    />
  </div>
</template>

<script setup lang="ts">
import headerNav from "@/components/Common/header-nav.vue";
import GenerateLinkDialog from "@/components/Common/GenerateLinkDialog.vue";

import { Plus, Compass, ArrowLeft, Refresh, Promotion, Share, Link, Edit, Delete } from "@element-plus/icons-vue";
import { ref, watch, computed, onMounted } from "vue";
// 路由
import { useRouter } from "vue-router";
const router = useRouter();
// 类型
import type { SurveyDBReturnData } from "@/types";
// 工具方法
import { formatDate } from "@/utils";
// i18n
import { useI18n } from "vue-i18n";
// 数据库操作
import { deleteSurveyById, getAllSurvey, updateSurveyById, saveSurvey } from "@/db/operation";
// Store
import { useEditorStore } from "monorepo-survey-engine";
// UI
import { ElMessage, ElMessageBox } from "element-plus";
// 远程 API
import {
  getSurveyList,
  createSurvey,
  updateSurvey,
  deleteSurvey as deleteRemoteSurvey,
  getSurveyById,
  deserializeSurveyDetail,
  serializeComponents,
  extractSurveyMetadata,
  submitReview,
  applyTemplate
} from "@/api/modules/survey";
import type { TemplateCategory } from "@common/survey/survey.interface";

import { qiankunWindow } from "vite-plugin-qiankun/es/helper";

const { t } = useI18n();

// 微前端环境下 base 已提供 /editor 前缀，无需重复添加
const isQiankun = qiankunWindow.__POWERED_BY_QIANKUN__;
const editorPrefix = isQiankun ? "" : "/editor";

const store = useEditorStore();

const tableData = ref<SurveyDBReturnData[]>([]);

/** 当前正在同步的问卷 id，用于按钮 loading 态 */
const syncingId = ref<number | null>(null);
/** 远程数据加载状态 */
const remoteLoading = ref(false);

/** 远程同步是否失败 */
const remoteSyncFailed = ref(false);

// ─── 分页 ──────────────────────────────────────────────────────
const currentPage = ref(1);
const pageSize = ref(10);

// ─── 排序 ──────────────────────────────────────────────────────
/** 当前排序字段（null 表示无排序） */
const sortProp = ref<string | null>(null);
/** 当前排序方向 */
const sortOrder = ref<"ascending" | "descending" | null>(null);

/** 排序后的全量数据（不修改原始 tableData） */
const sortedTableData = computed(() => {
  const data = [...tableData.value];
  if (!sortProp.value || !sortOrder.value) return data;

  const dir = sortOrder.value === "ascending" ? 1 : -1;
  return data.sort((a, b) => {
    const valA = a[sortProp.value as keyof SurveyDBReturnData] as number;
    const valB = b[sortProp.value as keyof SurveyDBReturnData] as number;
    return (valA - valB) * dir;
  });
});

/** 前端分页：按当前页码与每页条数截取（基于排序后的数据） */
const pagedTableData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sortedTableData.value.slice(start, start + pageSize.value);
});

/** 表格排序变化处理（Element Plus sort-change 事件） */
const handleSortChange = ({ prop, order }: { prop: string; order: string | null }) => {
  sortProp.value = prop || null;
  sortOrder.value = order as "ascending" | "descending" | null;
  currentPage.value = 1; // 排序后回到第一页
};

// ─── 本地数据 ──────────────────────────────────────────────────

/** 获取本地所有问卷 */
async function getLocalData() {
  const res = await getAllSurvey();
  tableData.value = res as SurveyDBReturnData[];
}

// ─── 远程数据同步（含详情下载与本地持久化） ──────────────────

/** 从远程获取问卷列表，并将未同步/需更新的问卷详情下载到本地 IndexedDB */
async function fetchRemoteList() {
  remoteLoading.value = true;
  remoteSyncFailed.value = false;

  try {
    // 1. 获取本地已有数据，构建 remote_survey_id → 本地记录的映射
    const localMap = new Map<string, SurveyDBReturnData>();
    for (const item of tableData.value) {
      if (item.remote_survey_id) {
        localMap.set(item.remote_survey_id, item);
      }
    }

    // 2. 分页获取远程问卷列表
    let page = 1;
    const pageSize = 100;
    let hasMore = true;
    const remoteSurveys: Array<{
      id: string;
      title: string;
      updated_at: string;
      status: number;
      review_status: string;
    }> = [];
    const downloadTasks: Array<() => Promise<void>> = [];

    while (hasMore) {
      const res = await getSurveyList({ page, page_size: pageSize });
      if (res.code !== 0 || !res.data) break;

      remoteSurveys.push(...res.data.surveys);
      hasMore = page * pageSize < res.data.total;
      page++;

      // 所有问卷均为个人问卷（模板已解耦到独立的 templates 表）
      for (const remote of res.data.surveys) {
        const localRecord = localMap.get(remote.id);
        const remoteUpdatedAt = new Date(remote.updated_at).getTime();

        const needsDownload =
          !localRecord || remoteUpdatedAt > localRecord.updateDate || localRecord.syncStatus !== "synced";

        if (needsDownload) {
          downloadTasks.push(() => downloadAndPersistSurvey(remote.id, remoteUpdatedAt, remote.review_status));
        } else if (localRecord && localRecord.syncStatus !== "synced") {
          await updateSurveyById(localRecord.id, { syncStatus: "synced" });
        }
      }
    }

    // 并行下载详情（限制并发数 3，避免压垮服务器）
    const CONCURRENCY = 3;
    for (let i = 0; i < downloadTasks.length; i += CONCURRENCY) {
      await Promise.all(downloadTasks.slice(i, i + CONCURRENCY).map(fn => fn()));
    }

    // 3. 清理：本地已同步但远程已不存在的问卷（用户在另一设备删除了）
    const remoteIds = new Set(remoteSurveys.map(s => s.id));
    for (const [remoteId, localRecord] of localMap) {
      if (!remoteIds.has(remoteId) && localRecord.syncStatus === "synced") {
        // 远程已删除，标记为未同步（保留本地数据供用户手动处理）
        await updateSurveyById(localRecord.id, { syncStatus: "unsynced" });
      }
    }
  } catch {
    remoteSyncFailed.value = true;
    console.warn("[Layout] 远程问卷列表获取失败，仅展示本地数据");
  } finally {
    remoteLoading.value = false;
    // 刷新本地数据以展示最新同步结果
    await getLocalData();
  }
}

/**
 * 下载单个远程问卷详情并持久化到本地 IndexedDB
 *
 * @param remoteSurveyId 远程问卷 ID
 * @param remoteUpdatedAt 远程更新时间戳（ms），用于设置本地 updateDate
 */
async function downloadAndPersistSurvey(
  remoteSurveyId: string,
  remoteUpdatedAt: number,
  reviewStatus?: string
): Promise<void> {
  try {
    // 获取远程问卷详情（含组件列表）
    const detailRes = await getSurveyById(remoteSurveyId);
    if (detailRes.code !== 0 || !detailRes.data) {
      console.warn(`[Layout] 获取问卷 ${remoteSurveyId} 详情失败`);
      return;
    }

    const detail = detailRes.data;

    // 数据校验：确保标题和组件非空
    const title = detail.title?.trim() || "未命名问卷";
    const components = detail.components ?? [];
    if (components.length === 0) {
      console.warn(`[Layout] 问卷 ${remoteSurveyId} 组件列表为空，跳过`);
      return;
    }

    // 将后端组件格式反序列化为前端 Status[] 格式
    const deserializedComs = deserializeSurveyDetail(components);

    // 查找本地是否已有该远程问卷的记录
    const existingLocal = tableData.value.find(l => l.remote_survey_id === remoteSurveyId);

    if (existingLocal && existingLocal.id !== undefined) {
      // 本地已有记录 → 更新
      await updateSurveyById(existingLocal.id, {
        title,
        coms: deserializedComs as unknown as SurveyDBReturnData["coms"],
        surveyCount: detail.total_questions ?? deserializedComs.length,
        pageSize: detail.page_size ?? 10,
        updateDate: remoteUpdatedAt,
        syncStatus: "synced",
        remote_survey_id: remoteSurveyId,
        review_status: reviewStatus ?? existingLocal.review_status ?? "none"
      } as any);
    } else {
      // 本地无记录 → 新建
      const now = Date.now();
      await saveSurvey({
        title,
        coms: deserializedComs as unknown as SurveyDBReturnData["coms"],
        surveyCount: detail.total_questions ?? deserializedComs.length,
        pageSize: detail.page_size ?? 10,
        createDate: new Date(detail.created_at).getTime() || now,
        updateDate: remoteUpdatedAt || now,
        syncStatus: "synced",
        remote_survey_id: remoteSurveyId,
        review_status: reviewStatus ?? "none"
      } as any);
    }
  } catch (err) {
    console.warn(`[Layout] 同步问卷 ${remoteSurveyId} 失败:`, err);
    // 单个问卷同步失败不阻塞其他问卷
  }
}

// ─── 页面初始化 ────────────────────────────────────────────────

onMounted(async () => {
  await getLocalData();
  fetchRemoteList();
});

/** 监听问卷更新：当编辑器中点击"更新问卷"后，自动刷新表格同步状态 */
watch(
  () => store.lastUpdatedId,
  newId => {
    if (newId !== null) {
      getLocalData();
    }
  }
);

// ─── 审核状态映射 ──────────────────────────────────────────────

/** 审核状态 → Element Plus Tag type */
function reviewStatusType(status: string): "warning" | "success" | "danger" | "info" {
  const map: Record<string, "warning" | "success" | "danger" | "info"> = {
    none: "info",
    pending: "warning",
    approved: "success",
    rejected: "danger"
  };
  return map[status] ?? "info";
}

// ─── 申请共享模板 ──────────────────────────────────────────────

const templateDialogVisible = ref(false);
const templateApplying = ref(false);
const sharingSurveyId = ref("");
const templateForm = ref({
  category: "" as string,
  submit_message: ""
});

// ─── 生成问卷链接 ──────────────────────────────────────────────

/** 生成链接弹窗可见性 */
const generateLinkDialogVisible = ref(false);
/** 当前要生成链接的问卷 ID（远程 ID） */
const generateLinkSurveyId = ref("");

/** 打开生成链接弹窗 */
const handleGenerateLink = (surveyInfo: SurveyDBReturnData) => {
  if (!surveyInfo.remote_survey_id) {
    ElMessage.warning("请先同步问卷到远程数据库");
    return;
  }
  generateLinkSurveyId.value = surveyInfo.remote_survey_id;
  generateLinkDialogVisible.value = true;
};

/** 链接生成成功后的回调 */
const onLinkGenerated = () => {
  // 可以在此处刷新本地数据
};

const resetTemplateForm = () => {
  templateForm.value = { category: "", submit_message: "" };
};

const handleShareTemplate = (surveyInfo: SurveyDBReturnData) => {
  if (!surveyInfo.remote_survey_id) return;
  sharingSurveyId.value = surveyInfo.remote_survey_id;
  resetTemplateForm();
  templateDialogVisible.value = true;
};

const submitApplyTemplate = async () => {
  if (!templateForm.value.category) {
    ElMessage.warning(t("layout.templateCategoryRequired"));
    return;
  }
  templateApplying.value = true;
  try {
    const res = await applyTemplate(sharingSurveyId.value, {
      category: templateForm.value.category as TemplateCategory,
      submit_message: templateForm.value.submit_message || undefined
    });
    if (res.code === 0) {
      templateDialogVisible.value = false;
      ElMessage.success(t("layout.shareTemplateSuccess"));
      await getLocalData();
    } else {
      ElMessage.error(res.msg || t("layout.shareTemplateFailed"));
    }
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.msg || err?.message || t("layout.shareTemplateFailed"));
  } finally {
    templateApplying.value = false;
  }
};

/** 提审操作 */
const handleSubmitForReview = async (surveyInfo: SurveyDBReturnData) => {
  if (!surveyInfo.remote_survey_id) {
    ElMessage.warning("请先同步问卷到远程数据库");
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认将问卷《${surveyInfo.title}》提交审核？提交后需等待管理员审核通过方可发布。`,
      t("layout.submitReviewTitle"),
      { confirmButtonText: t("layout.confirm"), cancelButtonText: t("layout.cancel"), type: "warning" }
    );
  } catch {
    return;
  }

  try {
    const res = await submitReview(surveyInfo.remote_survey_id, {
      submit_message: "从主页提交审核"
    });
    if (res.code === 0) {
      // 更新本地 review_status
      await updateSurveyById(surveyInfo.id, { review_status: "pending" } as any);
      await getLocalData();
      ElMessage.success(t("layout.submitReviewSuccess"));
    } else {
      ElMessage.error(res.msg || t("layout.submitReviewFailed"));
    }
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.msg || err?.message || t("layout.submitReviewFailed"));
  }
};

// ─── 导航 ──────────────────────────────────────────────────────

const goLand = () => {
  router.push({ name: "land" });
};

const goToEditor = () => {
  // 清空当前选中的组件
  store.resetComs();
  localStorage.setItem("activeView", "editor");
  router.push(`${editorPrefix}/survey-type`);
};

const goToComMarket = () => {
  localStorage.setItem("activeView", "materials");
  router.push("/materials");
};

// ─── 问卷操作 ──────────────────────────────────────────────────

/** 删除问卷（本地 + 远程） */
const handleDeleteSurvey = (surveyInfo: SurveyDBReturnData) => {
  ElMessageBox.confirm(t("layout.deleteConfirm"), t("layout.deleteTitle"), {
    confirmButtonText: t("layout.confirm"),
    cancelButtonText: t("layout.cancel"),
    type: "warning"
  })
    .then(async () => {
      try {
        // 1. 远程删除（如果已同步）
        if (surveyInfo.remote_survey_id) {
          try {
            await deleteRemoteSurvey(surveyInfo.remote_survey_id);
          } catch {
            // 远程删除失败不阻塞本地删除
            console.warn("[Layout] 远程删除失败，将继续删除本地数据");
          }
        }

        // 2. 本地删除
        await deleteSurveyById(surveyInfo.id);
        await getLocalData();
        ElMessage.success(t("layout.deleteSuccess"));
      } catch {
        ElMessage.error(t("layout.deleteFailed"));
      }
    })
    .catch(() => {
      ElMessage.info(t("layout.deleteCancelled"));
    });
};

/** 预览问卷 */
const viewSurvey = (surveyInfo: SurveyDBReturnData) => {
  router.push({
    path: `/preview/${surveyInfo.id}`,
    state: { from: "home" }
  });
};

/** 编辑问卷 */
const editSurvey = (surveyInfo: SurveyDBReturnData) => {
  router.push(`${editorPrefix}/${surveyInfo.id}/survey-type`);
};

/** 同步问卷到远程数据库 */
const syncSurvey = async (surveyInfo: SurveyDBReturnData) => {
  syncingId.value = surveyInfo.id;
  try {
    // 序列化组件数据为后端格式
    const components = serializeComponents(surveyInfo.coms as unknown as Parameters<typeof serializeComponents>[0]);
    const { title, description } = extractSurveyMetadata(
      surveyInfo.coms as unknown as Parameters<typeof extractSurveyMetadata>[0]
    );

    // 确保标题非空
    const safeTitle = title || surveyInfo.title || "未命名问卷";

    if (surveyInfo.remote_survey_id) {
      // 已存在远程记录 → 更新
      const res = await updateSurvey(surveyInfo.remote_survey_id, {
        title: safeTitle,
        description,
        components,
        page_size: surveyInfo.pageSize
      });
      if (res.code === 0) {
        await updateSurveyById(surveyInfo.id, { title: safeTitle, syncStatus: "synced" });
        await getLocalData();
        ElMessage.success(t("layout.syncSuccess"));
      } else {
        ElMessage.error(res.msg || t("layout.syncFailed"));
      }
    } else {
      // 首次同步 → 创建远程记录
      const res = await createSurvey({
        title: safeTitle,
        description,
        components,
        page_size: surveyInfo.pageSize
      });
      if (res.code === 0 && res.data) {
        // 存储远程问卷 ID 并标记已同步
        await updateSurveyById(surveyInfo.id, {
          remote_survey_id: res.data.survey_id,
          title: safeTitle,
          syncStatus: "synced"
        });
        await getLocalData();
        ElMessage.success(t("layout.syncSuccess"));
      } else {
        ElMessage.error(res.msg || t("layout.syncFailed"));
      }
    }
  } catch {
    ElMessage.error(t("layout.syncFailed"));
  } finally {
    syncingId.value = null;
  }
};
</script>

<style scoped lang="scss">
.layout-page {
  // 用精确的 100vh 代替 min-height:100vh，配合 border-box 把工具类附加的 padding 也计入其中，
  // 页面盒子不再随内容被撑高，从根本上避免出现浏览器级滚动条
  height: 100vh;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  // 与登录页/land页/编辑器工作区统一的大留白背板色（亮/暗两套取值见 variables.scss / theme-dark.scss）
  background-color: var(--page-backdrop);
  background-image: var(--page-bg-image);
  // 背景统一铺满整个视口：页面高度已被精确限定，背景不会因内容被撑高而被放大拉伸
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

// 表格 + 分页的弹性伸缩区域：撑满标题/按钮组之外的剩余空间，
// 视口变矮时由它自行收缩（min-height:0 解除 flex 子项默认的内容最小高度限制），
// 超出的行交由 el-table 自身内部滚动条承担，分页器始终保持完整可见、不被裁切
.table-area {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-wrap {
  flex: 1 1 auto;
  min-height: 0;
}

// 操作列圆形图标按钮容器：横向紧凑排列，不换行、不撑开表格行高
.action-icons {
  display: flex;
  align-items: center;
  // 按钮数量不同时自动均分整列宽度，间隔随之自适应，比固定 gap 更不容易出现左右挤在一起的观感
  justify-content: space-around;
  flex-wrap: nowrap;

  // shadcn 风格「outline」图标按钮：不用高饱和度实心圆底色，
  // 但也不能完全透明——边框始终用 --el-color-primary（亮色下近黑、暗色下近白，
  // 随亮暗主题与色弱模式自动联动）勾出圆形轮廓，保证不 hover 时也能看清是个圆按钮；
  // 图标本身用各自的语义色区分操作类型，hover 时才浮现一层同色系浅底强调。
  // 浅底用 color-mix 直接从当前生效的 --el-color-* 混出，而不是查 Element Plus
  // 内置、不随色弱模式联动的 light-9 派生变量，避免图标已变色但底色还是旧色系
  .el-button {
    // 比默认 small 圆形按钮(24px)更大一档，图标也同步放大，避免显得过小
    width: 30px;
    height: 30px;
    font-size: 15px;
    border-width: 1px;
    border-style: solid;
    // 静止态用主色描边勾出圆形轮廓，但调暗到 30% 透明度，避免像主色实色描边那样刺眼；
    // 亮/暗模式下分别是浅灰/深灰描边，仍能看清圆形但不抢眼，hover 时才用各自语义色加深
    border-color: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
    box-shadow: none;
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;

    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 1px;
    }

    // disabled 态（如「审核中」的提审按钮）：整体调淡，取消 hover 反馈
    &.is-disabled {
      opacity: 0.4;
      &:hover {
        background-color: transparent !important;
        border-color: color-mix(in srgb, var(--el-color-primary) 30%, transparent) !important;
      }
    }
  }

  // 同步
  .el-button--primary {
    --el-button-bg-color: transparent;
    --el-button-border-color: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
    --el-button-text-color: var(--el-color-primary);
    --el-button-hover-border-color: var(--el-color-primary);
    --el-button-hover-text-color: var(--el-color-primary);
    --el-button-active-bg-color: transparent;
    --el-button-active-border-color: var(--el-color-primary);

    &:hover {
      background-color: color-mix(in srgb, var(--el-color-primary) 14%, transparent);
    }
  }
  // 共享模板
  .el-button--success {
    --el-button-bg-color: transparent;
    --el-button-border-color: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
    --el-button-text-color: var(--el-color-success);
    --el-button-hover-border-color: var(--el-color-success);
    --el-button-hover-text-color: var(--el-color-success);
    --el-button-active-bg-color: transparent;
    --el-button-active-border-color: var(--el-color-success);

    &:hover {
      background-color: color-mix(in srgb, var(--el-color-success) 14%, transparent);
    }
  }
  // 提审 / 生成问卷链接（二者互斥展示，共用同一语义色）
  .el-button--warning {
    --el-button-bg-color: transparent;
    --el-button-border-color: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
    --el-button-text-color: var(--el-color-warning);
    --el-button-hover-border-color: var(--el-color-warning);
    --el-button-hover-text-color: var(--el-color-warning);
    --el-button-active-bg-color: transparent;
    --el-button-active-border-color: var(--el-color-warning);

    &:hover {
      background-color: color-mix(in srgb, var(--el-color-warning) 14%, transparent);
    }
  }
  // 编辑：常规操作，中性灰即可，避免与共享/提审/删除等强调色抢视觉
  .el-button--info {
    --el-button-bg-color: transparent;
    --el-button-border-color: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
    --el-button-text-color: var(--el-text-color-secondary);
    --el-button-hover-border-color: var(--el-text-color-primary);
    --el-button-hover-text-color: var(--el-text-color-primary);
    --el-button-active-bg-color: transparent;
    --el-button-active-border-color: var(--el-text-color-primary);

    &:hover {
      background-color: var(--el-fill-color);
    }
  }
  // 删除：破坏性操作，静止态与其它按钮同样只是主色描边，仅 hover 时才浮现红色浅底强调，
  // 避免一直用高饱和红色圆块抢镜
  .el-button--danger {
    --el-button-bg-color: transparent;
    --el-button-border-color: color-mix(in srgb, var(--el-color-primary) 30%, transparent);
    --el-button-text-color: var(--el-text-color-secondary);
    --el-button-hover-border-color: var(--el-color-danger);
    --el-button-hover-text-color: var(--el-color-danger);
    --el-button-active-bg-color: transparent;
    --el-button-active-border-color: var(--el-color-danger);

    &:hover {
      background-color: color-mix(in srgb, var(--el-color-danger) 16%, transparent);
    }
  }
}

// 暗色模式下同步按钮（primary 类型）的图标着色修正：
// theme-dark.scss 里有一条全局规则 html.dark .el-button--primary:not(.is-link)
// 把主色按钮文字/图标强制改成近黑色 #18181b，那是为「实心白底」的主色按钮设计的
// （白底需要深色字才能看清）；但这里的同步按钮底色是透明的，被强制成近黑色图标后
// 会直接融进暗色页面背景里、几乎看不见。用更高特异性的选择器覆盖回主色本身的取值
// （暗色下 --el-color-primary 为近白色 #fafafa，与透明底形成正常对比）
html.dark .action-icons .el-button--primary:not(.is-link) {
  --el-button-text-color: var(--el-color-primary);
  --el-button-hover-text-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  // 分页器不参与 table-area 的弹性收缩，始终保持完整可见
  flex-shrink: 0;
}

.text-muted {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.sync-hint {
  font-size: 13px;
  color: var(--el-color-primary);
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &--error {
    color: var(--el-color-warning);
  }
}

// ── 问卷标题链接 ──────────────────────────────────────

.survey-title-link {
  color: var(--font-color-primary, var(--el-text-color-primary));
  cursor: pointer;
  font-weight: 500;
  text-decoration: none;
  border-radius: 2px;
  padding: 1px 4px;
  margin: -1px -4px;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;

  &:hover {
    color: var(--primary-color);
    text-decoration: underline;
    text-underline-offset: 3px;
    background-color: var(--fill-color, var(--el-fill-color-light));
  }

  &:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
}

/* 暗色主题 */
html.dark .survey-title-link {
  color: var(--el-text-color-primary);

  &:hover {
    color: var(--el-color-primary-light-3);
    background-color: var(--el-fill-color-light);
  }
}
</style>
