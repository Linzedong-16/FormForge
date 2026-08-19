<template>
  <!-- 统一大留白背板：无论加载中/加载失败/加载成功都套用同一背景，避免状态切换时背景闪跳 -->
  <div class="survey-page">
    <div v-if="surveyData" class="survey-container mc survey-scope">
      <!-- 问卷标题与状态信息 -->
      <div class="survey-header mt-30 mb-20">
        <h2 class="survey-title">{{ surveyData.title || "问卷" }}</h2>
        <div v-if="surveyData.description" class="survey-desc">{{ surveyData.description }}</div>
        <div class="survey-meta mt-10">
          <el-tag v-if="surveyData.publishedAt" type="success" size="small" effect="plain">
            发布时间：{{ surveyData.publishedAt }}
          </el-tag>
          <span class="ml-10 text-muted">{{ t("survey.questionCount") }}：{{ visibleQuestionCount }}</span>
        </div>
      </div>
      <div
        v-for="(com, i) in visibleComs"
        v-show="isInCurrentPage(i) && isVisibleToFiller(com)"
        :key="com.client_key || com.id"
        class="content mb-10"
      >
        <component
          :is="com.type"
          :status="com.status"
          :serial-num="serialNum[i]"
          v-bind="{ ...getOptionPoolProp(com), ...getComputedValueProp(com) }"
          @update-answer="updateAnswer(getAnswerKey(com), $event)"
        />
      </div>
      <!-- 分页器：total 按当前动态可见题目数计算，隐藏题目不再占用分页坑位 -->
      <div class="flex justify-content-center mt-20">
        <SurveyPagination v-model:current-page="currentPage" v-model:page-size="pageSize" :total="visibleComs.length" />
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
    <div v-else-if="loadError" class="text-center mt-40">
      <p class="load-error-msg">{{ loadError }}</p>
      <el-button type="primary" @click="retryLoad">重试</el-button>
    </div>
    <div v-else class="text-center mt-40">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon>
      <p style="color: var(--login-text-muted); margin-top: 12px">加载问卷中...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { onMounted, provide, ref, computed, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import type { QuizData, Status } from "@/types";
import type { ClientKey, JumpRule, RawAnswerValue, RuleRuntimeComponent } from "monorepo-survey-engine";
import {
  computeDerivedField,
  isOptionsProps,
  isStringArray,
  resolveJump,
  resolveOptionPool,
  resolveVisibility,
  useRuleRuntime
} from "monorepo-survey-engine";
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
  getSurveyMetadata
} from "@/api/modules/survey";
import { useEditorStore } from "monorepo-survey-engine";

const { t } = useI18n();
const route = useRoute();

/** 提供函数式 surveyId 获取器，供签名组件上传时使用 */
provide("getSurveyId", () => route.params.id as string | null);

/**
 * 填写者视角预览模式（T049 / FR-006）：由编辑器 Header.vue 通过 query 参数 preview=1 打开，
 * 复用本页面渲染与规则引擎，但数据来源改为编辑器内存中的 Pinia store（而非网络请求已发布问卷），
 * 且不产生真实提交请求，不写入 Response/Answer 记录
 */
const isPreviewMode = computed(() => route.query.preview === "1");

// ─── 状态 ────────────────────────────────────────────────────

const surveyData = ref<QuizData | null>(null);
const loadError = ref<string | null>(null);
const submitting = ref(false);

/** 组件映射表（id/order_index/答案 store 键），供 serializeAnswers 查找与答案回填索引 */
const componentMap = ref<Array<{ id: string; order_index: number; key: ClientKey }>>([]);

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

// ─── 答案收集 ────────────────────────────────────────────────

/**
 * 解析题目在答案 store 中使用的键：优先取稳定标识 client_key（供规则引擎跨题引用），
 * 未回填 client_key 时依次回退：后端反序列化路径产出的 _componentId → 组件自身的 id
 * （预览模式下数据源为编辑器 store 的原生 Status[]，只带 id 字段，不带 _componentId，
 * 因此必须补充 .id 回退，否则同一份题目在预览模式下会解析出相同的空键而互相覆盖答案）
 */
const getAnswerKey = (com: Status): ClientKey =>
  com.client_key || (com as unknown as { _componentId?: string })._componentId || com.id;

/** 集中式答案 store：以 client_key（或回退 id）为键，题目组件统一双向绑定该 store */
const answers: Ref<Record<ClientKey, RawAnswerValue>> = ref({});

const updateAnswer = (key: ClientKey, answer: RawAnswerValue) => {
  answers.value[key] = answer;
};

// ─── 动态规则引擎接入（题目显示/隐藏） ──────────────────────────

/**
 * 从题目 options 面板配置中提取规则引擎所需的选项文本数组：
 * 仅 single-select 等题型的 options.status 是纯字符串数组时才有意义（与 normalizeAnswerValue 的
 * extractOptionTexts 期望的 { options: string[] } 语义对齐）；多选/图片选/级联等题型的求值分支
 * 不依赖 comConfig，此处返回 undefined 即安全兜底，不影响其规则求值
 */
const buildComConfig = (com: Status): unknown => {
  const optionsField = com.status.options;
  if (!optionsField || !isOptionsProps(optionsField) || !isStringArray(optionsField.status)) return undefined;
  return { options: optionsField.status };
};

/** 供规则引擎求值的题目清单：稳定键 + 题型 + 选项配置，随答卷题目列表变化自动更新 */
const ruleComponents = computed<RuleRuntimeComponent[]>(() =>
  (surveyData.value?.coms ?? []).map(com => ({
    clientKey: getAnswerKey(com),
    material: com.name,
    comConfig: buildComConfig(com)
  }))
);

const { normalizedAnswers } = useRuleRuntime({ components: ruleComponents, answers });

/**
 * 单条动态规则求值的异常安全包装（FR-012）：规则引擎内部已对"引用已删除题目""类型不兼容比较"等
 * 典型异常配置做了兜底（不抛异常），但填写页仍需防御规则引擎未预见的畸形配置（如历史脏数据缺失
 * 必需字段）导致的运行时异常——一旦某道题目的某条规则求值抛出异常，只应忽略这一条规则并回退到
 * 默认状态，不能连带影响其余题目的渲染或导致整页崩溃/白屏；同时以 warn 级别记录，供设计者事后排查
 */
const safeEvaluateRule = <T,>(clientKey: ClientKey, ruleLabel: string, defaultValue: T, evaluate: () => T): T => {
  try {
    return evaluate();
  } catch (err) {
    console.warn(
      `[SurveyView] 题目 ${clientKey} 的${ruleLabel}求值异常，已忽略该规则并按默认状态处理，请检查该题目的动态规则配置`,
      err
    );
    return defaultValue;
  }
};

/**
 * 按填写者实际会经历的路径过滤后的题目列表：题目渲染、分页总量、进度序号（useSurveyNo）统一以此为准，
 * FR-008 明确要求进度指示基于"实际会经历的题目集合"而非设计总量（T030/T031 共用同一份路径计算）。
 * 融合两类规则：
 *   1. 显示/隐藏规则（resolveVisibility）：命中隐藏的题目本身不进入路径；
 *   2. 跳转规则（resolveJump，FR-003 first-match-wins）：题目命中跳转规则时，源题目与跳转目标之间
 *      的题目整体被跳过（不渲染、不可作答）；若跳转目标恰好被隐藏规则命中，下方循环会在到达该下标时
 *      因命中隐藏而继续前进，自然顺延到下一个实际可见题目，无需额外分支处理（acceptance scenario 4）。
 * 未配置规则的题目两个函数均安全兜底为"可见/不跳转"，与规则引擎接入前行为完全一致（零回归）。
 */
const visibleComs = computed<Status[]>(() => {
  if (!surveyData.value) return [];
  const coms = surveyData.value.coms;
  const result: Status[] = [];
  // 跳转命中后应跳过到的目标下标；-1 表示当前没有正在跳过的区间
  let skipToIndex = -1;
  for (let i = 0; i < coms.length; i++) {
    if (i < skipToIndex) continue;
    const com = coms[i]!;
    const key = getAnswerKey(com);
    const visibility = safeEvaluateRule(key, "显示/隐藏规则", "visible" as const, () =>
      resolveVisibility(com.logic?.visibility, normalizedAnswers.value)
    );
    if (visibility === "hidden") continue;
    result.push(com);

    const jumpRule = safeEvaluateRule<JumpRule | null>(key, "跳转规则", null, () =>
      resolveJump(com.logic?.jump, normalizedAnswers.value)
    );
    if (!jumpRule) continue;
    if (jumpRule.target.type === "endSurvey") break;

    const targetIndex = coms.findIndex(target => target.client_key === jumpRule.target.targetKey);
    // 跳转目标必须晚于当前题目（与设计时"仅支持向后跳转"的约束一致）；目标不存在或异常时不生效，
    // 按顺序继续下一题，避免脏数据导致问卷卡死
    if (targetIndex > i) {
      skipToIndex = targetIndex;
    }
  }
  return result;
});

/** 页头展示的题目数量：基于当前可见题目动态计算（排除展示型的 text-note），随隐藏规则实时变化 */
const visibleQuestionCount = computed(() => visibleComs.value.filter(com => com.name !== "text-note").length);

/** 当前可见题目对应的答案 store 键集合，用于识别因规则重新命中而被隐藏的题目 */
const visibleAnswerKeys = computed(() => new Set(visibleComs.value.map(getAnswerKey)));

/**
 * 题目被规则重新判定为隐藏时清除其已填答案，使其不随问卷一起提交（FR-009 / acceptance scenario 4）；
 * 清理动作本身可能连锁触发依赖该答案的其他题目可见性变化，但每轮只会移除答案而不会新增，
 * 该收敛过程必然终止，不会造成无限循环
 */
watch(visibleAnswerKeys, keys => {
  for (const key of Object.keys(answers.value)) {
    if (!keys.has(key)) {
      delete answers.value[key];
    }
  }
});

// ─── 动态规则引擎接入（选项联动） ──────────────────────────────

/**
 * 每道配置了选项联动的题目，其当前候选选项集合（依据依赖题目最新答案实时计算，T033）；
 * 只登记配置了 optionDependency 的题目，未配置的题目不出现在此表中——
 * 题目组件据此区分"未启用选项联动"（不传递候选池 prop，保持原有全量选项渲染）与"候选池为空/待提示"
 */
const optionPools = computed<Record<ClientKey, string[] | { prompt: true }>>(() => {
  const pools: Record<ClientKey, string[] | { prompt: true }> = {};
  for (const com of visibleComs.value) {
    const mapping = com.logic?.optionDependency;
    if (!mapping) continue;
    const key = getAnswerKey(com);
    // 求值异常时不写入 pools（而非写入空数组），使该题目退化为"未配置选项联动"的默认状态：
    // 展示全量选项、不受限制，比强行判定候选池为空更贴合 FR-012"按默认状态展示"的要求
    const pool = safeEvaluateRule<string[] | { prompt: true } | undefined>(key, "选项联动规则", undefined, () =>
      resolveOptionPool(mapping, normalizedAnswers.value)
    );
    if (pool !== undefined) pools[key] = pool;
  }
  return pools;
});

/**
 * 依赖题目答案变化导致候选集合刷新时，若题目已选值不再属于新候选集合则清空（FR-004 acceptance scenario 2），
 * 与上方"隐藏题目清空答案"的 watch 同构：候选池收窄只做清空、不做新增，收敛必然终止。
 * 统一读取规范化后的 normalizedAnswers（kind: "text"）判断当前答案文本是否仍在候选集合内，
 * 从而屏蔽"选项索引存储（single-select）"与"选项文本存储（option-select）"两种题型的底层差异。
 */
watch(
  optionPools,
  pools => {
    for (const [key, pool] of Object.entries(pools)) {
      const validOptions = Array.isArray(pool) ? pool : [];
      const normalized = normalizedAnswers.value[key];
      if (normalized?.kind === "text" && !validOptions.includes(normalized.value)) {
        delete answers.value[key];
      }
    }
  },
  { deep: true }
);

/** 计算动态传递给题目组件的候选池 prop：仅对配置了选项联动的题目附带该 prop，其余题目保持零改动 */
const getOptionPoolProp = (com: Status): Record<string, string[] | { prompt: true }> => {
  const key = getAnswerKey(com);
  const pool = optionPools.value[key];
  return pool === undefined ? {} : { optionPool: pool };
};

// ─── 动态规则引擎接入（计算/派生字段） ──────────────────────────

/**
 * 每道"计算字段"题目（Material.ComputedField）当前的实时计算结果（T041）：
 * 依据 normalizedAnswers（已规范化的参与题目答案）调用 computeDerivedField 求值，
 * 未配置公式的计算字段题目不出现在此表中；求值失败/参与题目未全部作答且策略为
 * skipCalculation 时返回 null，由展示组件渲染为 "--"（ComputedField.vue 既有兜底）
 */
const computedFieldValues = computed<Record<ClientKey, number | null>>(() => {
  const values: Record<ClientKey, number | null> = {};
  for (const com of visibleComs.value) {
    if (com.name !== "computed-field" || !com.logic?.computedField) continue;
    const key = getAnswerKey(com);
    values[key] = safeEvaluateRule(key, "计算字段规则", null, () =>
      computeDerivedField(com.logic!.computedField!, normalizedAnswers.value)
    );
  }
  return values;
});

/**
 * 将计算字段的实时结果同步写回集中式答案 store：使其经由 useRuleRuntime 重新规范化为
 * NormalizedValue(kind: "number")，从而可被其他题目的显示条件、选项联动依赖乃至链式计算字段引用（T041）。
 * 结果为 null（未产出）时清除对应答案，避免残留脏值参与后续规则求值；与上方两处收敛式 watch 同构。
 */
watch(
  computedFieldValues,
  values => {
    for (const [key, value] of Object.entries(values)) {
      if (value === null) {
        if (key in answers.value) delete answers.value[key];
      } else if (answers.value[key] !== value) {
        answers.value[key] = value;
      }
    }
  },
  { deep: true, immediate: true }
);

/** 计算动态传递给计算字段题目组件的实时结果 prop：仅对计算字段题目附带该 prop，其余题目保持零改动 */
const getComputedValueProp = (com: Status): Record<string, number | null> => {
  if (com.name !== "computed-field") return {};
  return { computedValue: computedFieldValues.value[getAnswerKey(com)] ?? null };
};

/**
 * 计算字段题目是否应在填写页展示其内容区块（FR-005 "计算结果可选择性地展示给填写者"，
 * 对应设计器侧 ComputedFieldEditor.vue 的 visibleToFiller 开关，默认 true 兼容未显式配置的存量数据）。
 * 隐藏展示时该题目仍完整参与 computedFieldValues 计算、answers 写回与后续规则引用/提交持久化，
 * 只是不出现在填写者可见的 UI 中——与"隐藏但后台计算"的常见低代码问卷设计一致。
 * 非计算字段题目始终返回 true，不影响既有渲染逻辑。
 */
const isVisibleToFiller = (com: Status): boolean => {
  if (com.name !== "computed-field") return true;
  return com.logic?.computedField?.visibleToFiller ?? true;
};

// ─── 题目编号 ────────────────────────────────────────────────

const serialNum = computed(() => useSurveyNo(visibleComs.value).value);

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

    // 保留组件 id / order_index / 答案 store 键映射（提交答案时用）
    componentMap.value = detail.components.map(c => ({
      id: c.id,
      order_index: c.order_index,
      key: c.client_key || c.id
    }));

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

/**
 * 填写者视角预览模式的数据加载（T049）：不发起网络请求，直接读取编辑器 Pinia store 的内存态。
 * 依据是同页面 SPA 路由导航（router.push）不会销毁 Vue 应用实例，useEditorStore() 拿到的
 * 与编辑器页面完全是同一个 store 实例，可直接反映未保存的最新编辑结果。
 */
function loadPreviewSurvey() {
  loadError.value = null;
  const store = useEditorStore();

  if (store.coms.length === 0) {
    loadError.value = "编辑器中暂无题目，请先添加题目后再预览";
    return;
  }

  // store.coms 是编辑器原生的 Status[]，自带真实 Vue 组件引用与完整 logic 配置，
  // 无需经过 deserializeSurveyDetail 反序列化路径
  componentMap.value = store.coms.map((com, index) => ({
    id: com.id,
    order_index: index,
    key: com.client_key || com.id
  }));

  const { title, description } = getSurveyMetadata(store);
  const questionCount = store.coms.filter(com => com.name !== "text-note").length;

  surveyData.value = {
    title,
    description: description || undefined,
    publishedAt: undefined,
    coms: store.coms,
    surveyCount: questionCount
  };
}

/** 加载失败时的重试入口：按当前模式分发到真实加载或预览加载，避免预览模式下误触发网络请求 */
function retryLoad() {
  if (isPreviewMode.value) {
    loadPreviewSurvey();
  } else {
    loadSurvey();
  }
}

// ─── 提交答卷 ────────────────────────────────────────────────

const submitAnswers = async () => {
  const surveyId = route.params.id as string;
  if (!surveyId || Object.keys(answers.value).length === 0) {
    ElMessage.warning("请至少回答一道题目");
    return;
  }

  // 预览模式：仅模拟提交交互，不发起真实网络请求，不产生 Response/Answer 记录（T049 / FR-006）
  if (isPreviewMode.value) {
    ElMessage.success("预览模式：提交已模拟，不会写入真实数据");
    answers.value = {};
    return;
  }

  // serializeAnswers 按 order_index 匹配组件，此处将 client_key 键的答案 store 转换为其期望的下标键形式
  const indexedAnswers: Record<number, string | number | Date | string[] | Record<number, number>> = {};
  for (const c of componentMap.value) {
    const value = answers.value[c.key];
    if (value === undefined || value === null) continue;
    indexedAnswers[c.order_index] = value;
  }

  const answerItems = serializeAnswers(indexedAnswers, componentMap.value);

  // FR-003/FR-004：仅当问卷至少一道题目配置了动态规则时才补全"隐藏跳过/展示但留空"题目的 answer_status，
  // 使填写者的真实作答状态被如实上报；不含任何 logic 配置的问卷保持修复前的提交负载不变（FR-010 零回归约束）。
  // 上方 watch(visibleAnswerKeys) 已保证 answers.value 不会残留已隐藏题目的答案，故此处遍历全量
  // componentMap 补全的题目必然是"当前隐藏"（answer_status=1）或"当前可见但未填写"（answer_status=2）二者之一
  const hasDynamicLogic = (surveyData.value?.coms ?? []).some(com => !!com.logic);
  if (hasDynamicLogic) {
    const answeredComponentIds = new Set(answerItems.map(item => item.component_id));
    const visibleKeys = visibleAnswerKeys.value;
    for (const c of componentMap.value) {
      if (answeredComponentIds.has(c.id)) continue;
      answerItems.push({ component_id: c.id, answer_status: visibleKeys.has(c.key) ? 2 : 1 });
    }
  }

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
  if (isPreviewMode.value) {
    // 预览模式无需真实提交，跳过指纹采集与 token 获取，直接标记就绪以启用提交按钮
    loadPreviewSurvey();
    fingerprintReady.value = true;
  } else {
    loadSurvey();
    initFingerprint();
  }
});
</script>

<style scoped lang="scss">
.survey-page {
  // 问卷题目数量不定，内容可能远超一屏，需要保留页面级滚动，因此用 min-height 而非精确 100vh
  min-height: 100vh;
  // 与登录页/编辑器工作区/工作台首页统一的大留白背板色（亮/暗两套取值见 variables.scss / theme-dark.scss）
  background-color: var(--page-backdrop);
  background-image: var(--page-bg-image);
  background-size: cover;
  background-position: center;
  // fixed：背景固定于视口，避免内容撑高容器后 cover 被重新拉伸/裁切
  background-attachment: fixed;
  background-repeat: no-repeat;
}

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
