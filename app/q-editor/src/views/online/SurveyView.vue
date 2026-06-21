<template>
  <div v-if="surveyData">
    <div class="survey-container mc">
      <div class="mt-30 mb-20">{{ t("survey.questionCount") }}：{{ surveyData.surveyCount }}</div>
      <div v-for="(com, index) in surveyData.coms" v-show="isInCurrentPage(index)" :key="index" class="content mb-10">
        <component
          :is="com.type"
          :status="com.status"
          :serial-num="serialNum[index]"
          @update-answer="updateAnswer(index, $event)"
        />
      </div>
      <!-- 分页器 -->
      <div class="flex justify-content-center mt-20">
        <SurveyPagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="surveyData.coms.length"
        />
      </div>
      <div class="mt-20 mb-20 text-center">
        <el-button type="primary" :loading="submitting" @click="submitAnswers">
          {{ t("survey.submitAnswer") }}
        </el-button>
      </div>
    </div>
  </div>
  <div v-else-if="loadError" class="text-center mt-40">
    <p>{{ loadError }}</p>
    <el-button @click="loadSurvey">重试</el-button>
  </div>
  <div v-else class="text-center mt-40">
    <el-icon class="is-loading" :size="24"><Loading /></el-icon>
    <p style="color: var(--login-text-muted); margin-top: 12px">加载问卷中...</p>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { onMounted, provide, ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import type { QuizData } from "@/types";
import { restoreComponentStatus } from "@/utils";
import { useSurveyNo } from "@/utils/hooks";
import SurveyPagination from "@/components/Common/SurveyPagination.vue";
import {
  getSurveyById,
  submitResponse,
  serializeAnswers,
  deserializeSurveyDetail,
  getComponentMap
} from "@/api/modules/survey";

const { t } = useI18n();
const route = useRoute();

/** 提供函数式 surveyId 获取器，供签名组件上传时使用 */
provide("getSurveyId", () => route.params.id as string | null);

// ─── 状态 ────────────────────────────────────────────────────

const surveyData = ref<QuizData | null>(null);
const loadError = ref<string | null>(null);
const submitting = ref(false);

/** 组件映射表（id → order_index），供 serializeAnswers 查找 */
const componentMap = ref<Array<{ id: string; order_index: number }>>([]);

// ─── 分页 ────────────────────────────────────────────────────

const currentPage = ref(1);
const pageSize = ref(Number(route.query.pageSize) || 10);

const isInCurrentPage = (index: number) => {
  const start = (currentPage.value - 1) * pageSize.value;
  return index >= start && index < start + pageSize.value;
};

// ─── 题目编号 ────────────────────────────────────────────────

const serialNum = computed(() => (surveyData.value ? useSurveyNo(surveyData.value.coms).value : []));

// ─── 答案收集 ────────────────────────────────────────────────

const answers: Ref<Record<number, string | number | Date | string[]>> = ref({});

const updateAnswer = (index: number, answer: string | number | string[]) => {
  // 使用全局下标作为 key（组件数组已是 order_index 升序）
  answers.value[index] = answer;
};

// ─── 加载问卷 ────────────────────────────────────────────────

async function loadSurvey() {
  loadError.value = null;
  const surveyId = route.params.id as string;
  console.log("[SurveyView] loading survey:", surveyId);

  try {
    const res = await getSurveyById(surveyId);

    if (res.code !== 0 || !res.data) {
      loadError.value = res.msg || "问卷不存在";
      return;
    }

    const detail = res.data;

    // 后端返回 components: SurveyComponentDetail[] → 反序列化为前端 Status[]
    // 反序列化：后端 SurveyComponentDetail[] → 前端 Status[]
    const coms = deserializeSurveyDetail(detail.components);

    restoreComponentStatus(coms as any);

    // 保留组件 id → order_index 映射（提交答案时用）
    componentMap.value = getComponentMap(detail.components);

    // 从已发布问卷计算题型数量（排除 text_type / text_note 等展示型组件）
    const questionCount = coms.filter(c => (c as any).name !== "text-note").length;

    surveyData.value = {
      coms: coms as any,
      surveyCount: questionCount
    };
  } catch (err) {
    console.error("[SurveyView] load failed:", err);
    loadError.value = "加载问卷失败，请检查网络连接";
  }
}

// ─── 提交答卷 ────────────────────────────────────────────────

const submitAnswers = async () => {
  const surveyId = route.params.id as string;
  if (!surveyId || Object.keys(answers.value).length === 0) {
    ElMessage.warning("请至少回答一道题目");
    return;
  }

  const answerItems = serializeAnswers(answers.value, componentMap.value);
  if (answerItems.length === 0) {
    ElMessage.warning("未匹配到有效题目，请检查问卷配置");
    return;
  }

  submitting.value = true;
  try {
    const res = await submitResponse(surveyId, {
      anonymous_id: crypto.randomUUID?.() ?? `anon_${Date.now()}`,
      answers: answerItems
    });

    if (res.code === 0) {
      ElMessage.success(t("survey.submitSuccess"));
      // 清空答案防止重复提交
      answers.value = {};
    } else {
      ElMessage.error(res.msg || "提交失败");
    }
  } catch (err) {
    console.error("[SurveyView] submit failed:", err);
    ElMessage.error("提交失败，请检查网络连接");
  } finally {
    submitting.value = false;
  }
};

// ─── 初始化 ──────────────────────────────────────────────────

onMounted(() => {
  loadSurvey();
});
</script>

<style scoped lang="scss">
.survey-container {
  width: 800px;
}
</style>
