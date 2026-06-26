/**
 * 问卷模块 API
 *
 * 职责：
 *   - 封装问卷相关的 HTTP 调用（serverClient.baseURL = "/api"，路径无需再加 /api 前缀）
 *   - 提供前端 Status[] → 后端 SurveyComponentPayload[] 的序列化工具
 *   - 提供从组件数组中提取问卷标题/描述的工具函数
 *   - 提供 AI 一键生成问卷的 SSE 流式接口
 *
 * 所有 TS 类型均来自 @common/survey/survey.interface，本文件不重复定义类型。
 */
import type { ApiResponse } from "@common/user/user.interface";
import type {
  CreateSurveyRequest,
  CreateSurveyResponse,
  UpdateSurveyRequest,
  SurveyListQuery,
  SurveyListResponse,
  SurveyDetail,
  SurveyComponentPayload,
  ApplyTemplateRequest,
  ApplyTemplateResponse,
  SubmitReviewRequest,
  SubmitResponseRequest,
  SubmitResponseResponse,
  ResponseListQuery,
  ResponseListResponse,
  SurveyResponseDetail,
  AnswerItem,
  TemplateListQuery,
  TemplateListResponse,
  TemplateDetail,
  UseTemplateRequest,
  UseTemplateResponse,
  RateTemplateRequest,
  RateTemplateResponse,
  GenerateLinkRequest,
  GenerateLinkResponse
} from "@common/survey/survey.interface";
import serverClient from "../../clients/server";

// ============================================================
// 问卷 CRUD
// ============================================================

/**
 * POST /api/surveys — 创建问卷
 *
 * @param data 创建请求，title 与 components 必填
 */
export const createSurvey = (data: CreateSurveyRequest): Promise<ApiResponse<CreateSurveyResponse>> =>
  serverClient.post("/surveys", data);

/**
 * GET /api/surveys — 获取问卷列表
 */
export const getSurveyList = (params?: SurveyListQuery): Promise<ApiResponse<SurveyListResponse>> =>
  serverClient.get("/surveys", { params });

/**
 * GET /api/surveys/:id — 获取问卷详情（含组件列表，B 端，需登录）
 */
export const getSurveyById = (surveyId: string): Promise<ApiResponse<SurveyDetail>> =>
  serverClient.get(`/surveys/${surveyId}`);

/**
 * GET /api/surveys/:id/public — 获取已发布问卷的公开详情（C 端，无需登录）
 */
export const getPublicSurveyById = (surveyId: string): Promise<ApiResponse<SurveyDetail>> =>
  serverClient.get(`/surveys/${surveyId}/public`);

/**
 * PUT /api/surveys/:id — 更新问卷
 */
export const updateSurvey = (surveyId: string, data: UpdateSurveyRequest): Promise<ApiResponse<SurveyDetail>> =>
  serverClient.put(`/surveys/${surveyId}`, data);

/**
 * DELETE /api/surveys/:id — 删除问卷
 */
export const deleteSurvey = (surveyId: string): Promise<ApiResponse<null>> =>
  serverClient.delete(`/surveys/${surveyId}`);

/**
 * POST /api/surveys/:id/publish — 发布问卷
 */
export const publishSurvey = (surveyId: string): Promise<ApiResponse<SurveyDetail>> =>
  serverClient.post(`/surveys/${surveyId}/publish`);

/**
 * POST /api/surveys/:id/close — 关闭问卷
 */
export const closeSurvey = (surveyId: string): Promise<ApiResponse<SurveyDetail>> =>
  serverClient.post(`/surveys/${surveyId}/close`);

/**
 * POST /api/surveys/:id/apply-template — 申请共享模板
 */
export const applyTemplate = (
  surveyId: string,
  data: ApplyTemplateRequest
): Promise<ApiResponse<ApplyTemplateResponse>> => serverClient.post(`/surveys/${surveyId}/apply-template`, data);

/**
 * POST /api/surveys/:id/submit-review — 提交问卷审核
 */
export const submitReview = (
  surveyId: string,
  data: SubmitReviewRequest
): Promise<ApiResponse<ApplyTemplateResponse>> => serverClient.post(`/surveys/${surveyId}/submit-review`, data);

// ============================================================
// 答卷
// ============================================================

/**
 * GET /api/surveys/:surveyId/token — 获取临时提交凭证（防重复提交）
 */
export const getSurveyToken = (surveyId: string): Promise<ApiResponse<{ token: string; expires_in: number }>> =>
  serverClient.get(`/surveys/${surveyId}/token`);

/**
 * POST /api/surveys/:surveyId/responses — 提交答卷
 *
 * 防重复提交：
 *   - fingerprint: 浏览器指纹 SHA-256 哈希（前端采集）
 *   - token: 临时提交凭证（从 getSurveyToken 获取）
 */
export const submitResponse = (
  surveyId: string,
  data: SubmitResponseRequest
): Promise<ApiResponse<SubmitResponseResponse>> => serverClient.post(`/surveys/${surveyId}/responses`, data);

/**
 * POST /api/surveys/:id/generate-link — 生成定时问卷链接
 *
 * @param surveyId 问卷 ID
 * @param data 包含截止时间 deadline（ISO 8601 格式）
 */
export const generateSurveyLink = (
  surveyId: string,
  data: GenerateLinkRequest
): Promise<ApiResponse<GenerateLinkResponse>> => serverClient.post(`/surveys/${surveyId}/generate-link`, data);

/**
 * GET /api/surveys/:surveyId/responses — 获取答卷列表
 */
export const getResponseList = (
  surveyId: string,
  params?: ResponseListQuery
): Promise<ApiResponse<ResponseListResponse>> => serverClient.get(`/surveys/${surveyId}/responses`, { params });

/**
 * GET /api/responses/:id — 获取答卷详情（含答案列表）
 */
export const getResponseById = (responseId: string): Promise<ApiResponse<SurveyResponseDetail>> =>
  serverClient.get(`/responses/${responseId}`);

/**
 * DELETE /api/responses/:id — 删除答卷
 */
export const deleteResponse = (responseId: string): Promise<ApiResponse<null>> =>
  serverClient.delete(`/responses/${responseId}`);

// ============================================================
// 数据序列化工具
// ============================================================

/**
 * 将编辑器 Status[] 序列化为后端 SurveyComponentPayload[]
 *
 * 映射规则（见 survey-data-mapping-analysis.md §5.3）：
 *   com.name   → payload.type（kebab-case → snake_case：single-select → single_select）
 *   com.status → payload.config（整体作为 survey_components.config JSON）
 *   数组下标   → payload.order_index（0-based）
 *   required   → 从 com.status.required 字段读取，支持布尔/数字/嵌套对象形式
 *
 * 数据清洗：config 中的 editCom（Vue 组件引用，不可序列化）和 id（UUID，仅编辑器内部使用）
 * 会被移除，以减小 JSON 体积。restoreComponentStatus 通过 name 字段即可恢复 editCom 引用。
 *
 * 参数使用结构化类型（不直接引用 Status 接口）以避免与编辑器类型系统循环依赖。
 * Status[] 与此参数类型结构兼容，无需显式转型。
 *
 * @param coms 编辑器组件数组（Status[] 结构兼容）
 */
export const serializeComponents = (
  coms: Array<{
    /** Material 名称，如 "single-select"，将被转为 snake_case */
    name: string;
    /** 组件内部配置，整体作为 config JSON 发送给后端 */
    status: Record<string, unknown>;
    [key: string]: unknown;
  }>
): SurveyComponentPayload[] =>
  coms.map((com, index) => {
    // kebab-case → snake_case（single-select → single_select）
    const type = com.name.replace(/-/g, "_");

    // 从组件配置中读取 required 字段，兼容三种形式：
    //   boolean: true/false
    //   number:  1/0
    //   对象:    { status: boolean }（部分组件使用嵌套结构）
    const rawRequired = com.status.required;
    let required: 0 | 1 = 0;
    if (typeof rawRequired === "boolean") {
      required = rawRequired ? 1 : 0;
    } else if (typeof rawRequired === "number") {
      required = rawRequired ? 1 : 0;
    } else if (rawRequired !== null && typeof rawRequired === "object") {
      required = (rawRequired as Record<string, unknown>).status ? 1 : 0;
    }

    return { type, config: cleanConfig(com.status), order_index: index, required };
  });

/**
 * 数据清洗：递归移除 config 中不可序列化或冗余的字段
 *
 * 移除字段：
 *   - editCom：Vue 组件引用，JSON.stringify 会丢失或报错，通过 restoreComponentStatus 的 name 字段恢复
 *   - id：UUID，仅编辑器内部使用，渲染和回显不需要
 *
 * 保留字段（渲染需要）：
 *   - status / currentStatus / isShow / name / isUse / value / label / children 等业务数据
 *
 * @param status 组件配置对象
 * @returns 清洗后的配置对象
 */
const cleanConfig = (status: Record<string, unknown>): Record<string, unknown> => {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(status)) {
    if (value === null || value === undefined) {
      // 保留 null/undefined 值（如 placeholder 可能为空）
      cleaned[key] = value;
    } else if (Array.isArray(value)) {
      // 递归清洗数组中的对象元素
      cleaned[key] = value.map(item =>
        item && typeof item === "object" ? cleanConfig(item as Record<string, unknown>) : item
      );
    } else if (typeof value === "object") {
      // 移除编辑器和 ID 信息，保留业务数据
      const rest = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([k]) => k !== "editCom" && k !== "id")
      );

      // 递归处理嵌套对象
      cleaned[key] = cleanConfig(rest);
    } else {
      // 原始值（string, number, boolean）直接保留
      cleaned[key] = value;
    }
  }

  return cleaned;
};

/**
 * 从编辑器组件数组中提取问卷级别的标题与描述
 *
 * 编辑器将问卷标题/描述存储在 text-type 组件的 status 中，而非 Store 顶层字段：
 *   status.type.currentStatus === 0 → 标题组件，取 status.title.status
 *   status.type.currentStatus === 1 → 段落描述组件，取 status.desc.status
 *
 * 背景：surveys 表有独立的 title / description 列，但编辑器 Store 未单独维护，
 * 提交前须从组件中提取（见 survey-data-mapping-analysis.md §3.1）。
 */
export const extractSurveyMetadata = (
  coms: Array<{
    status: Record<string, unknown>;
    [key: string]: unknown;
  }>
): { title: string; description: string } => {
  let title = "";
  let description = "";

  for (const com of coms) {
    // 将 status.type 作为未知对象处理，运行时读取 currentStatus 值
    const typeConfig = com.status["type"] as { currentStatus?: number } | undefined;
    const titleConfig = com.status["title"] as { isShow?: boolean; status?: unknown } | undefined;
    const descConfig = com.status["desc"] as { isShow?: boolean; status?: unknown } | undefined;

    // currentStatus === 0：标题类型组件，仅取第一个匹配项（避免后续 text-note 组件覆盖）
    if (!title && typeConfig?.currentStatus === 0 && titleConfig?.isShow !== false) {
      title = String(titleConfig?.status ?? "");
    }
    // currentStatus === 1：段落描述类型组件，仅取第一个匹配项
    if (!description && typeConfig?.currentStatus === 1 && descConfig?.isShow !== false) {
      description = String(descConfig?.status ?? "");
    }

    // 标题和描述都已找到，提前退出
    if (title && description) break;
  }

  return { title, description };
};

/**
 * 获取问卷元数据：优先使用 Store 显式字段，回退到组件数组提取
 *
 * 混合方案：若 Store 将来扩展了 surveyTitle/surveyDescription 字段，则优先使用；
 * 否则调用 extractSurveyMetadata 从 text-type 组件中提取。
 */
export const getSurveyMetadata = (store: {
  surveyTitle?: string;
  surveyDescription?: string;
  coms: Array<{ status: Record<string, unknown>; [key: string]: unknown }>;
}): { title: string; description: string } => {
  if (store.surveyTitle || store.surveyDescription) {
    return {
      title: store.surveyTitle ?? "",
      description: store.surveyDescription ?? ""
    };
  }
  return extractSurveyMetadata(store.coms);
};

/**
 * 将前端答案格式转换为后端提交格式
 *
 * @param answers    前端答案对象 { [orderIndex]: value }（组件下标 = order_index）
 * @param components 来自后端响应的组件详情（须包含真实数据库 id）
 */
export const serializeAnswers = (
  answers: Record<number, string | number | Date | string[] | Record<number, unknown>>,
  components: Array<{ id: string; order_index: number }>
): AnswerItem[] => {
  const result: AnswerItem[] = [];

  for (const [indexStr, value] of Object.entries(answers)) {
    // index 即组件在数组中的全局位置（= order_index，数组已排序）
    const orderIndex = parseInt(indexStr);
    const component = components.find(c => c.order_index === orderIndex);
    if (!component) continue;

    const item: AnswerItem = { component_id: component.id };

    if (Array.isArray(value)) {
      // 多选题 / 级联选择 / 排序题 → values 数组
      item.values = value.map(v => String(v));
    } else if (value instanceof Date) {
      // 日期时间题 → ISO 8601 字符串
      item.value = value.toISOString();
    } else if (typeof value === "object" && value !== null) {
      // 矩阵题等对象类型 → JSON 字符串存储，消费时 JSON.parse 还原
      item.value = JSON.stringify(value);
    } else {
      // 单选 / 文本 / 评分 / 滑块 / 下拉 / 签名 URL 等标量 → 直接转字符串
      item.value = String(value);
    }

    result.push(item);
  }

  return result;
};

// ============================================================
// 数据反序列化（后端响应 → 前端 Status[]）
// ============================================================

/**
 * 将后端 SurveyComponentDetail[] 反序列化回前端 Status[]
 *
 * serializeComponents 的逆向操作：
 *   type（snake_case 后端）   → Status.type（前端组件名）
 *   config（完整 Status 对象）  → 解构为 Status 字段
 *   order_index（排序）         → 按序排列
 *   id / survey_id              → 保留用于答案提交
 */
export const deserializeSurveyDetail = (
  components: Array<{
    id: string;
    survey_id: string;
    type: string;
    config: Record<string, unknown>;
    order_index: number;
    required: 0 | 1;
    created_at: string;
    updated_at: string;
  }>
): Array<Record<string, unknown> & { _componentId: string }> => {
  return [...components]
    .sort((a, b) => a.order_index - b.order_index)
    .map(c => ({
      // config 即是 upload 时的 com.status（内部配置），保持嵌套结构供组件读取
      status: c.config,
      // 关键还原：serializeComponents 把 com.name → type（snake_case），
      // restoreComponentStatus 需要 com.name 查找 componentMap 中的 Vue 组件
      name: (c.type || "").replace(/_/g, "-"),
      _componentId: c.id
    }));
};

/**
 * 保留组件 id → order_index 映射，供 serializeAnswers 使用
 */
export const getComponentMap = (
  components: Array<{ id: string; order_index: number }>
): Array<{ id: string; order_index: number }> => {
  return components.map(c => ({ id: c.id, order_index: c.order_index }));
};

// ============================================================
// AI 一键生成问卷（SSE 流式）
// ============================================================

/**
 * 创建 AI 问卷生成 SSE 流
 *
 * 复用 monorepo-sse-client/ai 的 createAIGenerateStream，
 * 自动注入 Bearer Token。本函数提供 q-editor 项目级别的便捷入口。
 *
 * @example
 * ```typescript
 * import { createAIGenerateStream } from "@/api/modules/survey";
 *
 * const stream = createAIGenerateStream({
 *   prompt: "生成一份客户满意度调查",
 *   onToken: (text) => appendToPreview(text),
 *   onComponent: (comp) => addComponentToCanvas(comp),
 *   onDone: (result) => finalize(result),
 *   onError: (msg) => showError(msg),
 * });
 * ```
 */
export { createAIGenerateStream, createAIPolishStream } from "monorepo-sse-client/ai";
export type { AIGenerateStreamOptions, AIPolishStreamOptions, AIPolishResult } from "monorepo-sse-client/ai";

// ============================================================
// 模板 API（方案B：完全解耦）
// ============================================================

/**
 * GET /api/templates — 模板市场列表
 */
export const getTemplateList = (params?: TemplateListQuery): Promise<ApiResponse<TemplateListResponse>> =>
  serverClient.get("/templates", { params });

/**
 * GET /api/templates/:id — 模板详情
 */
export const getTemplateDetail = (templateId: string): Promise<ApiResponse<TemplateDetail>> =>
  serverClient.get(`/templates/${templateId}`);

/**
 * POST /api/templates/:id/apply — 使用模板创建问卷
 */
export const useTemplate = (templateId: string, data?: UseTemplateRequest): Promise<ApiResponse<UseTemplateResponse>> =>
  serverClient.post(`/templates/${templateId}/apply`, data ?? {});

/**
 * POST /api/templates/:id/rate — 模板评分
 */
export const rateTemplate = (
  templateId: string,
  data: RateTemplateRequest
): Promise<ApiResponse<RateTemplateResponse>> => serverClient.post(`/templates/${templateId}/rate`, data);

// ============================================================
// 类型再导出（供外部模块按需直接引用）
// ============================================================
export type {
  ApiResponse,
  CreateSurveyRequest,
  CreateSurveyResponse,
  UpdateSurveyRequest,
  SurveyListQuery,
  SurveyListResponse,
  SurveyDetail,
  SurveyComponentPayload,
  ApplyTemplateRequest,
  ApplyTemplateResponse,
  SubmitReviewRequest,
  SubmitResponseRequest,
  SubmitResponseResponse,
  ResponseListQuery,
  ResponseListResponse,
  SurveyResponseDetail,
  AnswerItem,
  GenerateLinkRequest,
  GenerateLinkResponse
};
