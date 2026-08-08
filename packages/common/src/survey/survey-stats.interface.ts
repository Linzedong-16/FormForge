/**
 * 问卷统计模块 — 前后端通用 TypeScript 类型定义
 *
 * 职责：
 *   - 定义统计概览、单问卷分析、答卷查询等接口的请求/响应类型
 *   - 所有 BigInt 字段在 JSON 序列化后以 string 返回
 *
 * 后端实现：app/q-server/src/modules/survey/survey-stats/
 */

// ============================================================
//  1. 统计概览
// ============================================================

/** 每日趋势数据点 */
export interface DailyTrendPoint {
  /** 日期（YYYY-MM-DD） */
  date: string;
  /** 当日答卷数 */
  count: number;
}

/** GET /api/admin/stats/overview — 平台统计概览响应 */
export interface StatsOverviewResponse {
  /** 问卷总数（含草稿/已发布/已关闭） */
  total_surveys: number;
  /** 已发布问卷数 */
  published_surveys: number;
  /** 累计答卷总数 */
  total_responses: number;
  /** 今日新增答卷数 */
  responses_today: number;
  /** 本周新增答卷数 */
  responses_this_week: number;
  /** 最近 7 天每日答卷趋势 */
  trend_7_days: DailyTrendPoint[];
}

// ============================================================
//  2. 单问卷统计分析
// ============================================================

/** 选项分布条目 */
export interface OptionDistribution {
  /** 选项标签（单选题为选项文本，多选题为选项文本） */
  label: string;
  /** 选择次数 */
  count: number;
  /** 选择百分比（0 ~ 100） */
  percentage: number;
}

/** 题目统计信息 */
export interface QuestionStats {
  /** 组件 ID（BigInt → string） */
  component_id: string;
  /** 组件类型（single_select / multi_select / text_input 等） */
  type: string;
  /** 题目标题（从 config.title.status 提取） */
  title: string;
  /** 排序序号 */
  order_index: number;
  /** 该题答案总数 */
  total_answers: number;
  /** 单选题/多选题 — 选项分布 */
  options_distribution?: OptionDistribution[];
  /** 评分题/滑块题 — 平均值 */
  average?: number;
  /** 评分题/滑块题 — 最小值 */
  min?: number;
  /** 评分题/滑块题 — 最大值 */
  max?: number;
  /** 文本题 — 抽样答案列表 */
  sample_answers?: string[];
}

/** GET /api/admin/surveys/:id/stats — 单问卷统计响应 */
export interface SurveyStatsResponse {
  /** 问卷 ID */
  survey_id: string;
  /** 问卷标题 */
  title: string;
  /** 总答卷数 */
  total_responses: number;
  /** 有效答卷数（status=1 已提交） */
  valid_responses: number;
  /** 完成率（百分比 0~100） */
  completion_rate: number;
  /** 每日答卷趋势 */
  daily_trend: DailyTrendPoint[];
  /** 每题统计 */
  questions: QuestionStats[];
}

// ============================================================
//  3. 问卷结构（供 ai-service Agent 工具只读查询）
// ============================================================

/** 单题结构条目 */
export interface QuestionStructureItem {
  /** 组件 ID（BigInt → string） */
  id: string;
  /** 组件类型（single_select / multi_select / text_input 等） */
  type: string;
  /** 题目标题 */
  title: string;
  /** 是否必答 */
  required: boolean;
  /** 选项标签列表（单选/多选/矩阵题），无选项时为 null */
  options: string[] | null;
}

/** GET /api/admin/surveys/:id — 问卷结构响应 */
export interface SurveyStructureResponse {
  /** 问卷 ID */
  survey_id: string;
  /** 问卷标题 */
  title: string;
  /** 问卷描述 */
  description: string | null;
  /** 题目结构列表（按 order_index 排序） */
  questions: QuestionStructureItem[];
}

// ============================================================
//  4. 答卷查询
// ============================================================

/** GET /api/admin/surveys/:id/responses — 答卷列表查询参数 */
export interface AdminResponseListQuery {
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页条数，默认 20，最大 100 */
  page_size?: number;
  /** 答卷状态 0=未完成 / 1=已提交 */
  status?: 0 | 1;
  /** 提交时间起始（ISO 8601） */
  date_from?: string;
  /** 提交时间截止（ISO 8601） */
  date_to?: string;
  /** 关键词搜索（匿名 ID 或答案内容模糊匹配） */
  keyword?: string;
}

/** 答卷中的单条答案（带组件上下文信息，便于展示） */
export interface AnswerWithContext {
  /** 组件 ID */
  component_id: string;
  /** 组件类型 */
  component_type: string;
  /** 题目标题 */
  component_title: string;
  /** 单值答案 */
  value?: string;
  /** 多值答案 */
  values?: string[];
}

/** 答卷列表条目 */
export interface AdminResponseItem {
  /** 答卷 ID */
  id: string;
  /** 匿名 ID */
  anonymous_id: string | null;
  /** 状态 */
  status: 0 | 1;
  /** 提交时间（ISO 8601） */
  submitted_at: string | null;
  /** 创建时间（ISO 8601） */
  created_at: string;
  /** 答案列表（带组件上下文） */
  answers: AnswerWithContext[];
}

/** GET /api/admin/surveys/:id/responses — 答卷列表响应 */
export interface AdminResponseListResponse {
  /** 答卷列表 */
  responses: AdminResponseItem[];
  /** 总数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页条数 */
  page_size: number;
}

// ============================================================
//  5. 报表导出
// ============================================================

/** GET /api/admin/surveys/:id/responses/export — 导出查询参数 */
export interface ExportQuery {
  /** 导出格式 */
  format?: "csv";
  /** 提交时间起始（ISO 8601） */
  date_from?: string;
  /** 提交时间截止（ISO 8601） */
  date_to?: string;
}
