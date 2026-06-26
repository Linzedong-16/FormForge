<template>
  <div v-if="surveyData">
    <div class="survey-container mc">
      <!-- 问卷标题与状态信息 -->
      <div class="survey-header mt-30 mb-20">
        <h2 class="survey-title">{{ surveyData.title || "问卷" }}</h2>
        <div v-if="surveyData.description" class="survey-desc">{{ surveyData.description }}</div>
        <div class="survey-meta mt-10">
          <el-tag v-if="surveyData.publishedAt" type="success" size="small" effect="plain">
            发布时间：{{ surveyData.publishedAt }}
          </el-tag>
          <span class="ml-10 text-muted">{{ t("survey.questionCount") }}：{{ surveyData.surveyCount }}</span>
        </div>
      </div>
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
        <el-button type="primary" :loading="submitting" :disabled="!fingerprintReady" @click="submitAnswers">
          {{ submitting ? "提交中..." : t("survey.submitAnswer") }}
        </el-button>
        <div v-if="!fingerprintReady" class="fingerprint-hint">
          <el-icon class="is-loading"><Loading /></el-icon>
          正在准备提交环境...
        </div>
      </div>
    </div>
  </div>
  <div v-else-if="loadError" class="text-center mt-40">
    <p class="load-error-msg">{{ loadError }}</p>
    <el-button type="primary" @click="loadSurvey">重试</el-button>
  </div>
  <div v-else class="text-center mt-40">
    <el-icon class="is-loading" :size="24"><Loading /></el-icon>
    <p style="color: var(--login-text-muted); margin-top: 12px">加载问卷中...</p>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { onMounted, provide, ref, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import type { QuizData } from "@/types";
import { restoreComponentStatus } from "@/utils";
import { useSurveyNo } from "@/utils/hooks";
import { getFingerprint } from "@/utils/fingerprint";
import SurveyPagination from "@/components/Common/SurveyPagination.vue";
import {
  getPublicSurveyById,
  getSurveyToken,
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

// ─── 防重复提交 ──────────────────────────────────────────────

/** 浏览器指纹 SHA-256 哈希 */
const fingerprint = ref<string | null>(null);
/** 临时提交凭证（从后端获取） */
const token = ref<string | null>(null);
/** 指纹采集是否就绪 */
const fingerprintReady = ref(false);

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
    const res = await getPublicSurveyById(surveyId);

    if (res.code !== 0 || !res.data) {
      // 区分不同的错误类型
      const msg = res.msg || "问卷不存在";
      if (msg.includes("截止") || msg.includes("已关闭")) {
        loadError.value = "该问卷已截止，不再接受填写";
      } else if (msg.includes("未发布")) {
        loadError.value = "该问卷尚未发布";
      } else {
        loadError.value = msg;
      }
      return;
    }

    const detail = res.data;

    // 后端返回 components: SurveyComponentDetail[] → 反序列化为前端 Status[]
    const coms = deserializeSurveyDetail(detail.components);

    restoreComponentStatus(coms as any);

    // 保留组件 id → order_index 映射（提交答案时用）
    componentMap.value = getComponentMap(detail.components);

    // 从已发布问卷计算题型数量（排除 text_note 等展示型组件）
    const questionCount = coms.filter(c => (c as any).name !== "text-note").length;

    // 格式化发布时间
    const publishedAt = detail.published_at
      ? new Date(detail.published_at).toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        })
      : undefined;

    surveyData.value = {
      title: detail.title,
      description: detail.description ?? undefined,
      publishedAt,
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

  // 防重复提交校验
  if (!fingerprintReady.value || !fingerprint.value || !token.value) {
    ElMessage.warning("正在准备提交环境，请稍后再试");
    return;
  }

  submitting.value = true;
  try {
    const res = await submitResponse(surveyId, {
      anonymous_id: crypto.randomUUID?.() ?? `anon_${Date.now()}`,
      answers: answerItems,
      fingerprint: fingerprint.value,
      token: token.value
    });

    if (res.code === 0) {
      ElMessage.success(t("survey.submitSuccess"));
      // 清空答案防止重复提交
      answers.value = {};
      // 重置 token 防止二次提交（用户需刷新页面获取新 token）
      token.value = null;
    } else if (res.code === 409) {
      // 重复提交
      ElMessage.warning(res.msg || "请勿重复提交");
    } else if (res.code === 400 && res.msg?.includes("过期")) {
      // Token 过期，提示刷新
      ElMessageBox.confirm("提交凭证已过期，是否刷新页面？", "提示", {
        confirmButtonText: "刷新",
        cancelButtonText: "取消",
        type: "warning"
      }).then(() => {
        window.location.reload();
      });
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

// ─── 初始化指纹与 Token ──────────────────────────────────────

/**
 * 页面加载时初始化防重复提交所需的指纹和 token
 *
 * 流程：
 *   1. 并行采集指纹 + 获取 token
 *   2. 任一失败时降级处理
 *   3. 成功后标记 fingerprintReady = true
 *
 * 降级策略：
 *   - Token 获取失败：提交时仅使用指纹（服务端降级处理）
 *   - 指纹采集失败：使用降级指纹（UA + 屏幕 + 时区）
 */
async function initFingerprint() {
  const surveyId = route.params.id as string;
  if (!surveyId) return;

  try {
    // 并行执行：指纹采集 + token 获取
    const [fpResult, tokenResult] = await Promise.allSettled([getFingerprint(), getSurveyToken(surveyId)]);

    if (fpResult.status === "fulfilled" && fpResult.value.success) {
      fingerprint.value = fpResult.value.hash;
      console.log("[SurveyView] fingerprint collected, env:", fpResult.value.env);
    } else {
      console.warn("[SurveyView] fingerprint collection failed, using fallback");
      // 降级：使用空指纹哈希，由服务端 IP 降级兜底
      fingerprint.value = "fallback_no_fingerprint";
    }

    if (tokenResult.status === "fulfilled" && tokenResult.value.code === 0) {
      token.value = tokenResult.value.data!.token;
      console.log("[SurveyView] token obtained");
    } else {
      console.warn("[SurveyView] token fetch failed, will proceed without token");
      // 降级：生成客户端临时 token（服务端在 Redis 不可用时也会降级）
      token.value = crypto.randomUUID?.() ?? `client_${Date.now()}`;
    }

    fingerprintReady.value = true;
  } catch (err) {
    console.error("[SurveyView] fingerprint init failed:", err);
    // 完全失败：仍然标记就绪，由服务端负责最终校验
    fingerprintReady.value = true;
  }
}

// ─── 初始化 ──────────────────────────────────────────────────

onMounted(() => {
  loadSurvey();
  initFingerprint();
});
</script>

<style scoped lang="scss">
.survey-container {
  width: 800px;
}

.survey-header {
  .survey-title {
    font-size: 22px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 8px;
  }

  .survey-desc {
    font-size: 14px;
    color: var(--el-text-color-secondary);
    line-height: 1.6;
  }

  .survey-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
}

.text-muted {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.load-error-msg {
  font-size: 15px;
  color: var(--el-color-danger);
  margin-bottom: 16px;
}

.fingerprint-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-color-warning);
}
</style>
