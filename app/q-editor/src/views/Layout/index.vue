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
          <el-button link type="primary" size="small" @click="deleteSurvey(scope.row)">{{
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
import { ref, watch, computed } from "vue";
// 路由
import { useRouter } from "vue-router";
const router = useRouter();
// 类型
import type { SurveyDBData, SurveyDBReturnData } from "@/types";
// 工具方法
import { formatDate } from "@/utils";
// i18n
import { useI18n } from "vue-i18n";

import { qiankunWindow } from "vite-plugin-qiankun/es/helper";

const { t } = useI18n();

// 微前端环境下 base 已提供 /editor 前缀，无需重复添加
const isQiankun = qiankunWindow.__POWERED_BY_QIANKUN__;
const editorPrefix = isQiankun ? "" : "/editor";

import { deleteSurveyById, getAllSurvey, updateSurveyById } from "@/db/operation";
import { useEditorStore } from "@/stores/useEditor";
import { ElMessage, ElMessageBox } from "element-plus";
const tableData = ref<SurveyDBData[]>([]);

/** 当前正在同步的问卷 id，用于按钮 loading 态 */
const syncingId = ref<number | null>(null);

// ─── 分页 ──────────────────────────────────────────────────────
const currentPage = ref(1);
const pageSize = ref(10);

/** 前端分页：按当前页码与每页条数截取表格数据 */
const pagedTableData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return tableData.value.slice(start, start + pageSize.value);
});

// 获取所有问卷
function getData() {
  getAllSurvey().then(res => {
    tableData.value = res;
  });
}
getData();

const store = useEditorStore();

/** 监听问卷更新：当编辑器中点击"更新问卷"后，自动刷新表格同步状态 */
watch(
  () => store.lastUpdatedId,
  newId => {
    if (newId !== null) {
      getData();
    }
  }
);

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

// 删除问卷
const deleteSurvey = (surveyInfo: SurveyDBReturnData) => {
  // 确认删除
  ElMessageBox.confirm(t("layout.deleteConfirm"), t("layout.deleteTitle"), {
    confirmButtonText: t("layout.confirm"),
    cancelButtonText: t("layout.cancel"),
    type: "warning"
  })
    .then(() => {
      // 确认删除，调用删除接口
      deleteSurveyById(surveyInfo.id)
        .then(() => {
          getData();
          ElMessage.success(t("layout.deleteSuccess"));
        })
        .catch(() => {
          ElMessage.error(t("layout.deleteFailed"));
        });
    })
    .catch(() => {
      ElMessage.info(t("layout.deleteCancelled"));
    });
};
// 预览问卷
const viewSurvey = (surveyInfo: SurveyDBReturnData) => {
  console.log(surveyInfo.id);
  router.push({
    path: `/preview/${surveyInfo.id}`,
    state: {
      from: "home"
    }
  });
};
// 编辑问卷
const editSurvey = (surveyInfo: SurveyDBReturnData) => {
  // 仅仅是做一个跳转，跳转到编辑器页面，但是需要将 id 带过去
  router.push(`${editorPrefix}/${surveyInfo.id}/survey-type`);
};

/** 同步问卷到远程数据库 */
const syncSurvey = async (surveyInfo: SurveyDBReturnData) => {
  syncingId.value = surveyInfo.id;
  try {
    // TODO: 对接实际的远程同步 API
    // 模拟同步延迟
    await new Promise(resolve => setTimeout(resolve, 800));
    // 更新本地同步状态
    await updateSurveyById(surveyInfo.id, { syncStatus: "synced" });
    // 刷新本地表格数据
    getData();
    ElMessage.success(t("layout.syncSuccess"));
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
