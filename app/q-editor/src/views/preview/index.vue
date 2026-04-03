<template>
  <div class="preview-container pb-40">
    <div class="center mc">
      <!-- 上面的按钮组 -->
      <div class="button-group flex space-between align-items-center no-print">
        <!-- 左边按钮 -->
        <div class="flex space-between">
          <el-button type="danger" @click="gobackHandle">返回</el-button>
          <el-button type="success" @click="generateOnlineSurvey">生成在线问卷</el-button>
          <el-button type="warning" @click="generatePDF">生成本地PDF</el-button>
        </div>
        <!-- 题目数量 -->
        <div class="mr-15">
          <el-text class="mx-1">题目数量：{{ store.surveyCount }}</el-text>
        </div>
      </div>
      <!-- 对应的问卷 -->
      <div class="content-group no-border">
        <div v-for="(com, index) in store.coms" :key="index" class="content mb-10">
          <component :is="com.type" :status="com.status" :serial-num="serialNum[index]" />
        </div>
      </div>
      <el-dialog v-model="dialogVisible" title="在线问卷" width="500">
        分享链接: <a :href="shareLink" target="_blank">{{ shareLink }}</a>
        <template #footer>
          <div class="dialog-footer">
            <el-button type="primary" @click="copyLink">复制链接</el-button>
          </div>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
const route = useRoute();
import { getSurveyById } from "@/db/operation";
// 仓库
import { useEditorStore } from "@/stores/useEditor";
const store = useEditorStore();
// 工具方法;
import { restoreComponentStatus } from "@/utils";
import { computed, ref } from "vue";
import { useSurveyNo } from "@/utils/hooks";
import router from "@/router";
import { canUsedForPDF } from "@/types";
import { ElMessage } from "element-plus";
import { v4 as uuidv4 } from "uuid";

const dialogVisible = ref(true);
const shareLink = ref("");

const copyLink = () => {
  const link = shareLink.value;
  if (link) {
    navigator.clipboard.writeText(link);
    ElMessage.success("链接复制成功");
  }
};

// 获取序号
const serialNum = computed(() => useSurveyNo(store.coms).value);
// 获取路由参数
const id = Number(route.params.id);
// 接下来应该根据拿到的 id 去获取存储的问卷题目
if (id) {
  getSurveyById(id).then(res => {
    console.log(res, "res");
    if (res) {
      // 组件部分需要重新还原
      restoreComponentStatus(res.coms);
      // 还原完成之后，将还原的数据设置为仓库里面的 coms 即可
      store.setStore(res);
    }
  });
}

// 返回
const gobackHandle = () => {
  router.push({
    name: "home",
    state: {
      from: "preview"
    }
  });
};

// 生成本地PDF
const generatePDF = () => {
  // 检查是否有题目类型不能生成PDF的
  if (!store.coms.every(com => canUsedForPDF(com.type))) {
    ElMessage.error("问卷中包含不能生成PDF的题目类型");
    return;
  }
  // 生成PDF
  window.print();
  ElMessage.success("PDF生成成功");
};

// 生成在线问卷
const generateOnlineSurvey = () => {
  // 发送数组组件到服务端
  const surveyId = uuidv4();
  // 发送数组组件到服务端
  fetch(`/api/generateSurvey`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      surveyId,
      coms: store.coms
    })
  });
  // 生成成功之后，将分享链接设置为 surveyId
  shareLink.value = `${window.location.origin}/survey/${surveyId}`;
  dialogVisible.value = true;
  ElMessage.success("在线问卷生成成功");
};
</script>

<style scoped lang="scss">
.preview-container {
  width: 100vw;
  min-height: 100vh;
}
.center {
  width: 800px;
}
.button-group {
  width: 100%;
  height: 60px;
  top: 0;
  left: 0;
  background-color: var(--white);
  z-index: 100;
}
.content-group {
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  background: var(--white);
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
}

// 打印样式
@media print {
  // 隐藏不需要打印的元素
  .no-print {
    display: none !important;
  }

  // 调整打印时的容器样式
  .preview-container {
    width: 100%;
    min-height: auto;
  }

  .center {
    width: 100%;
    max-width: 100%;
  }

  // 调整内容组的打印样式
  .content-group {
    border: none;
    box-shadow: none;
    padding: 0;
    margin: 0;
  }

  // 调整内容的打印样式
  .content {
    page-break-inside: avoid;
    margin-bottom: 20px !important;
  }

  // 隐藏滚动条
  ::-webkit-scrollbar {
    display: none;
  }
}
</style>
