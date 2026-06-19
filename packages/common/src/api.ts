import type { SurveyComponentPayload } from "./component.js";

// ── 通用响应包装 ──────────────────────────────────────────────────────────────

/**
 * 后端统一响应结构
 * @template T data 字段的类型，无 data 时传 undefined
 */
export interface ApiResponse<T = undefined> {
  success: boolean;
  message?: string;
  data?: T;
}

// ── POST /api/generateSurvey ──────────────────────────────────────────────────

/** 生成在线问卷请求体 */
export interface GenerateSurveyRequest {
  /** 前端生成的 UUID，作为问卷唯一标识 */
  surveyId: string;
  /** 问卷所有组件的序列化数组 */
  coms: SurveyComponentPayload[];
}

/** 生成在线问卷响应 */
export type GenerateSurveyResponse = ApiResponse<{
  surveyId: string;
  componentCount: number;
}>;

// ── GET /api/getSurvey/:surveyId（在线填答用）────────────────────────────────

/**
 * 获取在线问卷响应
 * 注意：coms 字段为 JSON 字符串（`JSON.stringify(SurveyComponentPayload[])`），
 * 前端收到后需先 `JSON.parse`，再调用 `restoreComponentStatus` 还原 Vue 组件引用。
 */
export interface GetSurveyOnlineResponse {
  success: boolean;
  /** `SurveyComponentPayload[]` 序列化后的 JSON 字符串 */
  coms: string;
  /** 题目数量（不含 text-note 等展示组件） */
  surveyCount: number;
}

// ── GET /api/survey/:surveyId（问卷管理用）──────────────────────────────────

/** 问卷详情（管理视图，coms 已反序列化为对象数组） */
export type GetSurveyDetailResponse = ApiResponse<{
  surveyId: string;
  title: string;
  description: string;
  coms: SurveyComponentPayload[];
}>;

// ── GET /api/surveys ──────────────────────────────────────────────────────────

/** 问卷列表条目（旧版 API，camelCase 格式） */
export interface LegacySurveyListItem {
  surveyId: string;
  title: string;
  description: string;
  componentCount: number;
  createdAt: string;
  updatedAt: string;
}

export type GetSurveysResponse = ApiResponse<LegacySurveyListItem[]>;

// ── 答案相关类型 ──────────────────────────────────────────────────────────────

/**
 * 单题答案值类型（JSON 序列化后可传输）
 *
 * - `string`   — 文本输入、个人信息题、日期时间（序列化为 ISO 8601 字符串）
 * - `number`   — 单选题索引（0-based）、评分题分值
 * - `number[]` — 多选题所选项索引数组
 */
export type SurveyAnswerValue = string | number | number[];

/**
 * 答案集合
 * - key：题目序号（从 1 开始，与前端 useSurveyNo 生成的 serialNum 对应）
 * - value：该题的作答值
 */
export type SurveyAnswers = Record<number, SurveyAnswerValue>;

// ── POST /api/submitAnswers ───────────────────────────────────────────────────

/** 提交问卷答案请求体 */
export interface SubmitAnswersRequest {
  surveyId: string;
  answers: SurveyAnswers;
}

/** 提交问卷答案响应 */
export type SubmitAnswersResponse = ApiResponse<{
  surveyId: string;
  /** 实际收到的答题数量 */
  answerCount: number;
  /** 服务器收到请求的时间，ISO 8601 */
  submittedAt: string;
}>;
