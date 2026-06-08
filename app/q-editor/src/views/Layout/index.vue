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
    <el-table :data="tableData" style="width: 100%" border>
      <el-table-column
        fixed
        prop="createDate"
        :label="t('layout.columnCreateDate')"
        width="150"
        :formatter="formatDate"
      />
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
  </div>
</template>

<script setup lang="ts">
import headerNav from "@/components/Common/header-nav.vue";

import { Plus, Compass, ArrowLeft } from "@element-plus/icons-vue";
import { ref } from "vue";
// 路由
import { useRouter } from "vue-router";
const router = useRouter();
// 类型
import type { SurveyDBData, SurveyDBReturnData } from "@/types";
// 工具方法
import { formatDate } from "@/utils";
// i18n
import { useI18n } from "vue-i18n";

const { t } = useI18n();

import { deleteSurveyById, getAllSurvey } from "@/db/operation";
import { useEditorStore } from "@/stores/useEditor";
import { ElMessage, ElMessageBox } from "element-plus";
const tableData = ref<SurveyDBData[]>([]);

// 获取所有问卷
function getData() {
  getAllSurvey().then(res => {
    tableData.value = res;
  });
}
getData();

const store = useEditorStore();

const goLand = () => {
  router.push({ name: "land" });
};

const goToEditor = () => {
  // 清空当前选中的组件
  store.resetComs();
  localStorage.setItem("activeView", "editor");
  router.push("/editor/survey-type");
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
  router.push(`/editor/${surveyInfo.id}/survey-type`);
};
</script>
