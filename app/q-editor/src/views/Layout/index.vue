<template>
  <div class="pt-20 pb-20 pl-20 pr-20">
    <headerNav>
      <template #left>
        <el-button :icon="ArrowLeft" circle size="small" @click="goLand" />
      </template>
    </headerNav>
    <h1 class="font-weight-100 text-center">低代码问卷系统</h1>
    <!-- 按钮组 -->
    <div class="mb-15">
      <el-button type="primary" :icon="Plus" @click="goToEditor">创建问卷</el-button>
      <el-button type="success" :icon="Compass" @click="goToComMarket">组件市场</el-button>
    </div>
    <!-- 数据表格 -->
    <el-table :data="tableData" style="width: 100%" border>
      <el-table-column fixed prop="createDate" label="创建日期" width="150" :formatter="formatDate" />
      <el-table-column prop="title" label="问卷标题" />
      <el-table-column prop="surveyCount" label="题目数" width="150" align="center" />
      <el-table-column prop="updateDate" label="最近更新日期" width="150" align="center" :formatter="formatDate" />
      <el-table-column fixed="right" label="操作" width="300" align="center">
        <template #default="scope">
          <el-button link type="primary" size="small" @click="viewSurvey(scope.row)">查看问卷</el-button>
          <el-button link type="primary" size="small" @click="editSurvey(scope.row)">编辑</el-button>
          <el-button link type="primary" size="small" @click="deleteSurvey(scope.row)">删除</el-button>
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
  ElMessageBox.confirm("确定删除问卷吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning"
  })
    .then(() => {
      // 确认删除，调用删除接口
      deleteSurveyById(surveyInfo.id)
        .then(() => {
          getData();
          ElMessage.success("问卷删除成功");
        })
        .catch(() => {
          ElMessage.error("问卷删除失败");
        });
    })
    .catch(() => {
      ElMessage.info("已取消删除");
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
