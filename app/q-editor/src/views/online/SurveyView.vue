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
        <el-button type="primary" @click="submitAnswers">{{ t("survey.submitAnswer") }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { onMounted, ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { useRoute } from "vue-router";
const route = useRoute();
import { useI18n } from "vue-i18n";

const { t } = useI18n();

import type { QuizData } from "@/types";

import { restoreComponentStatus } from "@/utils";
// 组合式函数
import { useSurveyNo } from "@/utils/hooks";
import SurveyPagination from "@/components/Common/SurveyPagination.vue";
// 获取题目编号
const serialNum = computed(() => useSurveyNo(surveyData.value?.coms).value);

const surveyData = ref<QuizData>({
  coms: [],
  surveyCount: 0
});

// 分页配置：每页组件数量来自分享链接 query（默认 10），当前页本地维护
const currentPage = ref(1);
const pageSize = ref(Number(route.query.pageSize) || 10);

// 判断某个全局索引的组件是否属于当前分页（index 保持全局，答案收集逻辑不受影响）
const isInCurrentPage = (index: number) => {
  const start = (currentPage.value - 1) * pageSize.value;
  return index >= start && index < start + pageSize.value;
};

onMounted(async () => {
  const surveyId = route.params.id;
  console.log(surveyId);
  // 从服务器获取试卷内容
  const response = await fetch(`/api/getSurvey/${surveyId}`);
  const data = await response.json();
  console.log(data);
  data.coms = JSON.parse(data.coms);
  restoreComponentStatus(data.coms);
  surveyData.value = data;
});

// 用来存储要发送服务器的答案
const answers: Ref<{ [key: number]: string | number | Date }> = ref({});

const updateAnswer = (index: number, answer: string | number) => {
  console.log(index, answer);
  const serial = serialNum.value[index];
  if (serial !== null) {
    // 说明是题目组件
    answers.value[serial!] = answer;
  }
  console.log(answers.value);
};

const submitAnswers = async () => {
  const surveyId = route.params.id;
  await fetch(`/api/submitAnswers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      surveyId,
      answers: answers.value
    })
  });

  ElMessage.success(t("survey.submitSuccess"));
};
</script>

<style scoped lang="scss">
.survey-container {
  width: 800px;
}
</style>
