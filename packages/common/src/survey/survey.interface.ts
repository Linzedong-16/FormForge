// ──────────────────────────────────────────────────────────────────────────────
// 问卷模块 — 前后端通用 TypeScript 类型与接口定义
//
// 所有类型严格对齐后端 Prisma schema：
//   surveys / survey_components / responses / answers
//
// 规范：
//   - BigInt 字段在 JSON 序列化后以 string 返回（NestJS/Prisma 惯例）
//   - 枚举值与 schema 字段注释保持一致
//
// 后端 schema：app/q-server/prisma/schema.prisma
// API 规范：   app/q-editor/prompt/survey-api-spec.md
// ──────────────────────────────────────────────────────────────────────────────

// ============================================================
//  1. 枚举
// ============================================================

/**
 * 问卷状态
 * 对应 surveys.status：0 草稿 / 1 已发布 / 2 已关闭
 */
export enum SurveyStatus {
  Draft = 0,
  Published = 1,
  Closed = 2
}

/**
 * 答卷提交状态
 * 对应 responses.status：0 未完成 / 1 已提交
 */
export enum ResponseStatus {
  Incomplete = 0,
  Submitted = 1
}

// ============================================================
//  2. 问卷组件类型 — 对应 survey_components 表
// ============================================================

/**
 * 组件配置（对应 survey_components.config JSON 字段）
 * 前端将组件 status 对象整体序列化后存入此字段
 */
export type SurveyComponentConfig = Record<string, unknown>;

/**
 * 创建/更新问卷时携带的组件载荷（无 id，由后端自增生成）
 *
 * 字段映射（见 survey-data-mapping-analysis.md §5.3）：
 *   前端 com.name  → type（kebab-case → snake_case，如 single-select → single_select）
 *   前端 com.status → config（整体序列化为 JSON）
 *   数组下标       → order_index（0-based）
 *   com.status.required → required（0 | 1）
 */
export interface SurveyComponentPayload {
  /** 组件类型，snake_case，如 single_select / multi_select / text_type / text_input */
  type: string;
  /** 前端组件完整 status 配置，作为 survey_components.config JSON 存储 */
  config: SurveyComponentConfig;
  /** 排序索引（0-based） */
  order_index: number;
  /** 是否必填：0 非必填 / 1 必填（对应 survey_components.required） */
  required: 0 | 1;
}

/**
 * 后端返回的组件详情（含数据库自增 id）
 *
 * 填答场景中 answers.component_id 必须对应此处的 id
 */
export interface SurveyComponentDetail extends SurveyComponentPayload {
  /** 组件主键（survey_components.id，BigInt → string） */
  id: string;
  /** 所属问卷 ID */
  survey_id: string;
  /** 创建时间（ISO 8601） */
  created_at: string;
  /** 最后更新时间（ISO 8601） */
  updated_at: string;
}

// ============================================================
//  3. 问卷实体 — 对应 surveys 表
// ============================================================

/**
 * 问卷列表条目（轻量视图，不含组件列表）
 */
export interface SurveyListItem {
  /** 问卷 ID（surveys.id，BigInt → string） */
  id: string;
  /** 创建者 ID（surveys.user_id） */
  user_id: string;
  /** 问卷标题 */
  title: string;
  /** 问卷描述（可为 null） */
  description: string | null;
  /** 状态：0 草稿 / 1 已发布 / 2 已关闭 */
  status: SurveyStatus;
  /** 每页显示题目数（surveys.page_size） */
  page_size: number;
  /** 题目总数，不含展示型组件（surveys.total_questions） */
  total_questions: number;
  /** 已收到答卷数，缓存字段（surveys.responses_count） */
  responses_count: number;
  /** 是否公开：0 私有 / 1 公开（surveys.is_public） */
  is_public: 0 | 1;
  /** 创建时间 */
  created_at: string;
  /** 最后更新时间 */
  updated_at: string;
  /** 发布时间（未发布时为 null） */
  published_at: string | null;
  /** 关闭时间（未关闭时为 null） */
  closed_at: string | null;
}

/**
 * 问卷详情（含组件列表）
 */
export interface SurveyDetail extends SurveyListItem {
  /** 访问密码（surveys.access_code，无密码时为 null） */
  access_code: string | null;
  /** 按 order_index 升序排列的组件列表 */
  components: SurveyComponentDetail[];
}

// ============================================================
//  4. 问卷 API — 请求体
// ============================================================

/**
 * POST /api/surveys — 创建问卷请求体
 *
 * 对应 surveys 表 + survey_components 表批量写入
 */
export interface CreateSurveyRequest {
  /** 问卷标题（必填，surveys.title） */
  title: string;
  /** 问卷描述（surveys.description） */
  description?: string;
  /** 每页显示题目数，默认 10（surveys.page_size） */
  page_size?: number;
  /** 是否公开：0 私有 / 1 公开，默认 1（surveys.is_public） */
  is_public?: 0 | 1;
  /** 初始状态，默认 0 草稿（surveys.status） */
  status?: SurveyStatus;
  /** 访问密码（surveys.access_code） */
  access_code?: string;
  /** 组件列表，批量写入 survey_components 表 */
  components: SurveyComponentPayload[];
}

/**
 * PUT /api/surveys/:id — 更新问卷请求体（部分更新）
 */
export interface UpdateSurveyRequest {
  title?: string;
  description?: string;
  status?: SurveyStatus;
  page_size?: number;
  is_public?: 0 | 1;
  access_code?: string;
  /** 组件列表（全量替换 survey_components） */
  components?: SurveyComponentPayload[];
}

/**
 * GET /api/surveys — 问卷列表查询参数
 */
export interface SurveyListQuery {
  /** 页码（从 1 开始） */
  page?: number;
  /** 每页数量 */
  page_size?: number;
  /** 状态筛选 */
  status?: SurveyStatus;
  /** 标题关键词 */
  keyword?: string;
}

// ============================================================
//  5. 问卷 API — 响应体
// ============================================================

/**
 * POST /api/surveys — 创建问卷响应
 */
export interface CreateSurveyResponse {
  /** 新建问卷 ID（BigInt → string） */
  survey_id: string;
  /** 问卷标题 */
  title: string;
  /** 初始状态（通常为 0 草稿） */
  status: SurveyStatus;
  /** 创建时间（ISO 8601） */
  created_at: string;
}

/**
 * GET /api/surveys — 问卷列表响应
 */
export interface SurveyListResponse {
  surveys: SurveyListItem[];
  total: number;
  page: number;
  page_size: number;
}

// ============================================================
//  6. 答案类型 — 对应 answers 表
// ============================================================

/**
 * 单题答案（对应 answers 表一行）
 *
 * 字段映射：
 *   component_id → answers.component_id（survey_components.id，BigInt → string）
 *   value        → answers.value（String?，文本/单选/评分）
 *   values       → answers.values（Json?，多选数组）
 */
export interface AnswerItem {
  /** 组件 ID（必须对应 SurveyComponentDetail.id） */
  component_id: string;
  /** 单值答案（文本/单选值） */
  value?: string;
  /** 多选答案数组 */
  values?: string[];
}

// ============================================================
//  7. 答卷 API — 请求体（对应 responses 表）
// ============================================================

/**
 * POST /api/surveys/:surveyId/responses — 提交答卷请求体
 *
 * 对应 responses 表写入 + answers 批量写入
 */
export interface SubmitResponseRequest {
  /** 答案列表（每题一条，批量写入 answers 表） */
  answers: AnswerItem[];
  /** 匿名用户标识（responses.anonymous_id，登录用户可不传） */
  anonymous_id?: string;
}

/**
 * GET /api/surveys/:id/responses — 答卷列表查询参数
 */
export interface ResponseListQuery {
  page?: number;
  page_size?: number;
}

// ============================================================
//  8. 答卷 API — 响应体
// ============================================================

/**
 * POST /api/surveys/:id/responses — 提交答卷响应
 */
export interface SubmitResponseResponse {
  /** 答卷 ID（responses.id，BigInt → string） */
  response_id: string;
  /** 提交时间（ISO 8601） */
  submitted_at: string;
}

/**
 * 答卷列表项（轻量视图）
 */
export interface ResponseListItem {
  id: string;
  survey_id: string;
  survey_title: string;
  user_id: string | null;
  anonymous_id: string | null;
  status: ResponseStatus;
  submitted_at: string | null;
  created_at: string;
}

/**
 * 答卷详情（含答案列表）
 */
export interface SurveyResponseDetail {
  id: string;
  survey_id: string;
  user_id: string | null;
  anonymous_id: string | null;
  status: ResponseStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  answers: AnswerItem[];
}

/**
 * GET /api/surveys/:id/responses — 答卷列表响应
 */
export interface ResponseListResponse {
  responses: ResponseListItem[];
  total: number;
  page: number;
  page_size: number;
}

// ============================================================
//  9. API 端点类型映射（参考 AuthApi 模式）
// ============================================================

/**
 * 问卷模块 API 类型映射
 *
 * @example
 * ```ts
 * import type { SurveyApi } from "@common/survey/survey.interface";
 * const body: SurveyApi["createSurvey"]["request"] = { title: "...", components: [] };
 * ```
 */
export interface SurveyApi {
  createSurvey: { request: CreateSurveyRequest; response: CreateSurveyResponse };
  getSurveyList: { request: SurveyListQuery; response: SurveyListResponse };
  getSurveyById: { request: void; response: SurveyDetail };
  updateSurvey: { request: UpdateSurveyRequest; response: SurveyDetail };
  deleteSurvey: { request: void; response: null };
  publishSurvey: { request: void; response: SurveyDetail };
  closeSurvey: { request: void; response: SurveyDetail };
  submitResponse: { request: SubmitResponseRequest; response: SubmitResponseResponse };
  getResponseList: { request: ResponseListQuery; response: ResponseListResponse };
  getResponseById: { request: void; response: SurveyResponseDetail };
  deleteResponse: { request: void; response: null };
}
