// ──────────────────────────────────────────────────────────────────────────────
// 审核模块 — 前后端通用 TypeScript 类型与接口定义
//
// 所有类型严格对齐后端 Prisma schema：
//   reviews 表、surveys 表 review_status 字段
//
// 规范：
//   - BigInt 字段在 JSON 序列化后以 string 返回
//   - 枚举值与 schema 字段注释保持一致
//   - 请求/响应类型与后端 Zod Schema 一一对应
// ──────────────────────────────────────────────────────────────────────────────

import type { ReviewStatus } from "../survey/survey.interface.js";

// ============================================================
//  1. 审核状态 / 审核类型 — 复用 survey 模块定义
// ============================================================

export type { ReviewStatus };

/** 审核类型：survey = 问卷审核, template = 模板审核 */
export type ReviewType = "survey" | "template";

// ============================================================
//  2. 审核列表项（轻量视图）
// ============================================================

/**
 * 审核列表条目
 * 对应 reviews 表 + 关联的 surveys / users 表信息
 */
export interface ReviewListItem {
  /** 审核记录 ID（reviews.id，BigInt → string） */
  review_id: string;
  /** 问卷 ID（reviews.survey_id，问卷审核时） */
  survey_id: string | null;
  /** 模板 ID（reviews.template_id，模板审核时） */
  template_id: string | null;
  /** 问卷/模板标题 */
  survey_title: string;
  /** 模板分类（仅模板审核时有值） */
  category: string | null;
  /** 提交者用户名（users.username） */
  submitter_name: string;
  /** 审核类型：survey / template */
  review_type: ReviewType;
  /** 审核状态 */
  status: ReviewStatus;
  /** 提交说明 */
  submit_message: string | null;
  /** 提交时间（ISO 8601） */
  submitted_at: string;
}

// ============================================================
//  3. 审核详情（含完整问卷内容）
// ============================================================

/**
 * 审核详情（用于管理员查看审核内容）
 */
export interface ReviewDetail {
  /** 审核记录 ID */
  review_id: string;
  /** 问卷 ID（问卷审核时） */
  survey_id: string | null;
  /** 模板 ID（模板审核时） */
  template_id: string | null;
  /** 问卷/模板标题 */
  survey_title: string;
  /** 问卷/模板描述 */
  survey_description: string | null;
  /** 模板分类 */
  category: string | null;
  /** 提交者 ID */
  submitter_id: string;
  /** 提交者用户名 */
  submitter_name: string;
  /** 审核类型：survey / template */
  review_type: ReviewType;
  /** 审核状态 */
  status: ReviewStatus;
  /** 提交说明 */
  submit_message: string | null;
  /** 审核意见 */
  review_comment: string | null;
  /** 审核人 ID（审核前为 null） */
  reviewer_id: string | null;
  /** 审核人用户名（审核前为 null） */
  reviewer_name: string | null;
  /** 提交时间（ISO 8601） */
  submitted_at: string;
  /** 审核完成时间（ISO 8601，审核前为 null） */
  reviewed_at: string | null;
  /** 问卷/模板题目组件列表 */
  components: ReviewComponentItem[];
}

/** 审核详情中的组件条目 */
export interface ReviewComponentItem {
  /** 组件 ID */
  id: string;
  /** 组件类型 */
  type: string;
  /** 组件配置（JSON 对象） */
  config: Record<string, unknown>;
  /** 排序索引 */
  order_index: number;
  /** 是否必填 */
  required: 0 | 1;
}

// ============================================================
//  4. API 请求/响应类型
// ============================================================

/** GET /api/admin/reviews — 审核列表查询参数 */
export interface ReviewListQuery {
  review_type?: ReviewType;
  status?: ReviewStatus;
  category?: string;
  page?: number;
  page_size?: number;
}

/** GET /api/admin/reviews — 审核列表响应 */
export interface ReviewListResponse {
  list: ReviewListItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

/** POST /api/admin/reviews/:id/approve — 审核通过请求 */
export interface ApproveReviewRequest {
  review_comment?: string;
}

/** POST /api/admin/reviews/:id/reject — 审核驳回请求 */
export interface RejectReviewRequest {
  review_comment: string;
}

/** 审核操作响应 */
export interface ReviewActionResponse {
  review_id: string;
  status: ReviewStatus;
  reviewed_at: string;
}
