<template>
  <div class="pt-20 pb-20 pl-20 pr-20">
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
    <!-- 数据表格 -->
    <el-table :data="pagedTableData" style="width: 100%" border height="500" @sort-change="handleSortChange">
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
      <el-table-column prop="title" :label="t('layout.columnTitle')" />
      <el-table-column prop="surveyCount" :label="t('layout.columnQuestionCount')" width="150" align="center" />
      <el-table-column
        prop="updateDate"
        :label="t('layout.columnUpdateDate')"
        width="150"
        align="center"
        sortable="custom"
        :formatter="formatDate"
      />
      <el-table-column fixed="right" :label="t('layout.columnAction')" width="300" align="center">
        <template #default="scope">
          <el-button
            link
            type="primary"
            size="small"
            :icon="Refresh"
            :loading="syncingId === scope.row.id"
            @click="syncSurvey(scope.row)"
            >{{ t("layout.syncSurvey") }}</el-button
          >
          <el-button link type="primary" size="small" @click="viewSurvey(scope.row)">{{
            t("layout.viewSurvey")
          }}</el-button>
          <el-button link type="primary" size="small" @click="editSurvey(scope.row)">{{ t("layout.edit") }}</el-button>
          <el-button link type="primary" size="small" @click="handleDeleteSurvey(scope.row)">{{
            t("layout.delete")
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
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
</template>

<script setup lang="ts">
import headerNav from "@/components/Common/header-nav.vue";

import { Plus, Compass, ArrowLeft, Refresh } from "@element-plus/icons-vue";
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
import { useEditorStore } from "@/stores/useEditor";
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
  extractSurveyMetadata
} from "@/api/modules/survey";

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
      survey_type: string;
    }> = [];
    const downloadTasks: Array<() => Promise<void>> = [];

    while (hasMore) {
      const res = await getSurveyList({ page, page_size: pageSize });
      if (res.code !== 0 || !res.data) break;

      remoteSurveys.push(...res.data.surveys);
      hasMore = page * pageSize < res.data.total;
      page++;

      // 仅同步个人问卷，跳过模板；收集需要下载的问卷
      for (const remote of res.data.surveys) {
        if (remote.survey_type !== "personal") continue;

        const localRecord = localMap.get(remote.id);
        const remoteUpdatedAt = new Date(remote.updated_at).getTime();

        const needsDownload =
          !localRecord || remoteUpdatedAt > localRecord.updateDate || localRecord.syncStatus !== "synced";

        if (needsDownload) {
          downloadTasks.push(() => downloadAndPersistSurvey(remote.id, remoteUpdatedAt));
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
async function downloadAndPersistSurvey(remoteSurveyId: string, remoteUpdatedAt: number): Promise<void> {
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
        remote_survey_id: remoteSurveyId
      });
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
        remote_survey_id: remoteSurveyId
      });
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
.table-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
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
</style>
