<template>
  <div class="preview-container pb-40">
    <div class="center mc survey-scope">
      <!-- 上面的按钮组 -->
      <div class="button-group flex space-between align-items-center no-print">
        <!-- 左边按钮 -->
        <div class="flex space-between">
          <el-button type="danger" @click="gobackHandle">{{ t("preview.back") }}</el-button>
          <el-button type="warning" @click="generatePDF">{{ t("preview.generatePDF") }}</el-button>
        </div>
        <!-- 题目数量 -->
        <div class="mr-15">
          <el-text class="mx-1">{{ t("preview.questionCount") }}：{{ store.surveyCount }}</el-text>
        </div>
      </div>
      <!-- 对应的问卷 -->
      <div class="content-group no-border">
        <div
          v-for="(com, index) in store.coms"
          v-show="isInCurrentPage(index) || isPrinting"
          :key="index"
          class="content mb-10"
        >
          <component :is="com.type" :status="com.status" :serial-num="serialNum[index]" />
        </div>
        <!-- 分页器 -->
        <div class="flex justify-content-center mt-20 no-print">
          <SurveyPagination
            v-model:current-page="store.currentPage"
            v-model:page-size="store.pageSize"
            :total="store.coms.length"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
const route = useRoute();
const router = useRouter();
import { getSurveyById } from "@/db/operation";
// 仓库
import { useEditorStore } from "@/stores/useEditor";
const store = useEditorStore();
// 工具方法
import { restoreComponentStatus } from "@/utils";
import { computed, ref, nextTick } from "vue";
import { useSurveyNo } from "@/utils/hooks";
import { canUsedForPDF } from "@/types";
import { ElMessage } from "element-plus";
import SurveyPagination from "@/components/Common/SurveyPagination.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

/** 打印模式：为 true 时展示全部组件，绕过分页的 v-show 限制 */
const isPrinting = ref(false);

// 判断某个全局索引的组件是否属于当前分页
const isInCurrentPage = (index: number) => {
  const start = (store.currentPage - 1) * store.pageSize;
  return index >= start && index < start + store.pageSize;
};

// 获取序号
const serialNum = computed(() => useSurveyNo(store.coms).value);
// 获取路由参数
const id = Number(route.params.id);
// 根据 id 从本地数据库加载问卷
if (id) {
  getSurveyById(id).then(res => {
    console.log(res, "res");
    if (res) {
      restoreComponentStatus(res.coms);
      store.setStore(res);
    }
  });
}

// 返回编辑器
const gobackHandle = () => {
  router.push({ name: "home", state: { from: "preview" } });
};

// 生成本地 PDF
const generatePDF = () => {
  if (!store.coms.every(com => canUsedForPDF(com.type))) {
    ElMessage.error(t("preview.pdfError"));
    return;
  }

  // 打印前展示全部组件，绕过分页的 v-show 限制
  isPrinting.value = true;
  nextTick(() => {
    const cleanup = () => {
      isPrinting.value = false;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  });
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
