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
    </div>
    <!-- 数据表格 -->
    <el-table :data="pagedTableData" style="width: 100%" border height="500">
      <el-table-column
        fixed
        prop="createDate"
        :label="t('layout.columnCreateDate')"
        width="150"
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
import { deleteSurveyById, getAllSurvey, updateSurveyById } from "@/db/operation";
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

// ─── 分页 ──────────────────────────────────────────────────────
const currentPage = ref(1);
const pageSize = ref(10);

/** 前端分页：按当前页码与每页条数截取表格数据 */
const pagedTableData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return tableData.value.slice(start, start + pageSize.value);
});

// ─── 本地数据 ──────────────────────────────────────────────────

/** 获取本地所有问卷 */
async function getLocalData() {
  const res = await getAllSurvey();
  tableData.value = res as SurveyDBReturnData[];
}

// ─── 远程数据同步 ──────────────────────────────────────────────

/** 从远程获取问卷列表，更新本地同步状态 */
async function fetchRemoteList() {
  remoteLoading.value = true;
  try {
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await getSurveyList({ page, page_size: pageSize });
      if (res.code !== 0 || !res.data) break;

      const { surveys: remoteSurveys, total } = res.data;

      // 遍历远程问卷，更新本地同步状态
      for (const remoteSurvey of remoteSurveys) {
        const matched = tableData.value.find(l => l.remote_survey_id === remoteSurvey.id);

        if (matched && matched.id !== undefined) {
          // 本地已有该问卷且已关联远程 ID → 确保同步状态为 synced
          if (matched.syncStatus !== "synced") {
            await updateSurveyById(matched.id, { syncStatus: "synced" });
          }
        }
      }

      // 判断是否还有下一页
      hasMore = page * pageSize < total;
      page++;
    }
  } catch {
    // 远程列表获取失败不阻塞本地数据展示
    console.warn("[Layout] 远程问卷列表获取失败，仅展示本地数据");
  } finally {
    remoteLoading.value = false;
    // 刷新本地数据以反映最新同步状态
    await getLocalData();
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
        await updateSurveyById(surveyInfo.id, { syncStatus: "synced" });
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
</style>
