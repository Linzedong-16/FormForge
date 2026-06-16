<template>
  <div class="preview-container pb-40">
    <div class="center mc">
      <!-- 上面的按钮组 -->
      <div class="button-group flex space-between align-items-center no-print">
        <!-- 左边按钮 -->
        <div class="flex space-between">
          <el-button type="danger" @click="gobackHandle">{{ t("preview.back") }}</el-button>
          <el-button v-permiss="'admin'" type="success" @click="generateOnlineSurvey">{{
            t("preview.generateOnline")
          }}</el-button>
          <el-button type="warning" @click="generatePDF">{{ t("preview.generatePDF") }}</el-button>
        </div>
        <!-- 题目数量 -->
        <div class="mr-15">
          <el-text class="mx-1">{{ t("preview.questionCount") }}：{{ store.surveyCount }}</el-text>
        </div>
      </div>
      <!-- 对应的问卷 -->
      <div class="content-group no-border">
        <div v-for="(com, index) in store.coms" v-show="isInCurrentPage(index)" :key="index" class="content mb-10">
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
      <el-dialog v-model="dialogVisible" :title="t('preview.onlineSurvey')" width="500">
        {{ t("preview.shareLink") }}: <a :href="shareLink" target="_blank">{{ shareLink }}</a>
        <template #footer>
          <div class="dialog-footer">
            <el-button type="primary" @click="copyLink">{{ t("preview.copyLink") }}</el-button>
          </div>
        </template>
      </el-dialog>
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
import { computed, ref } from "vue";
import { useSurveyNo } from "@/utils/hooks";
import { canUsedForPDF } from "@/types";
import { ElMessage } from "element-plus";
import SurveyPagination from "@/components/Common/SurveyPagination.vue";
import { useI18n } from "vue-i18n";
import { createSurvey, serializeComponents, getSurveyMetadata } from "@/api/modules/survey";

const { t } = useI18n();

const dialogVisible = ref(false);
const shareLink = ref("");

// 判断某个全局索引的组件是否属于当前分页
const isInCurrentPage = (index: number) => {
  const start = (store.currentPage - 1) * store.pageSize;
  return index >= start && index < start + store.pageSize;
};

const copyLink = () => {
  const link = shareLink.value;
  if (link) {
    navigator.clipboard.writeText(link);
    ElMessage.success(t("preview.copySuccess"));
  }
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
  window.print();
  ElMessage.success(t("preview.pdfSuccess"));
};

/**
 * 生成在线问卷
 *
 * 流程：
 *   1. 从 text-type 组件中提取问卷标题/描述（surveys.title / surveys.description）
 *   2. 将 Status[] 序列化为 SurveyComponentPayload[]（name → snake_case type，status → config）
 *   3. 调用 POST /api/surveys 创建问卷
 *   4. 用后端返回的真实 survey_id 构建分享链接
 */
const generateOnlineSurvey = async () => {
  try {
    // store.coms 的结构与 serializeComponents/getSurveyMetadata 参数兼容
    // （Status.name: Material extends string，Status.status: Record<string,TP|OP> extends Record<string,unknown>）
    const storeComs = store.coms as Array<{ name: string; status: Record<string, unknown>; [key: string]: unknown }>;

    // 提取问卷级别标题与描述（surveys.title / surveys.description 必须正确传递）
    const { title, description } = getSurveyMetadata({ coms: storeComs });

    // 序列化组件：Material kebab-case → snake_case type，status 整体作为 config JSON
    const components = serializeComponents(storeComs);

    if (components.length === 0) {
      ElMessage.warning("问卷中暂无组件，请先添加题目");
      return;
    }

    // 调用创建问卷接口（POST /api/surveys）
    const res = await createSurvey({
      title: title || "未命名问卷",
      description: description || undefined,
      page_size: store.pageSize,
      is_public: 1,
      components
    });

    // 后端统一响应：code === 0 表示成功
    if (res.code !== 0 || !res.data) {
      ElMessage.error(res.msg || t("preview.onlineError"));
      return;
    }

    // 用后端返回的真实 survey_id 构建填答分享链接
    const surveyId = res.data.survey_id;
    shareLink.value = `${window.location.origin}/survey/${surveyId}?pageSize=${store.pageSize}`;
    dialogVisible.value = true;
    ElMessage.success(t("preview.onlineSuccess"));
  } catch (err) {
    console.error("[generateOnlineSurvey]", err);
    ElMessage.error(t("preview.onlineError"));
  }
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
