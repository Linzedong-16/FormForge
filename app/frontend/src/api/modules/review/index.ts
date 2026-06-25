/**
 * 审核模块 API
 *
 * 封装审核管理相关 API：
 *   - GET    /api/admin/reviews          — 审核列表（分页+筛选）
 *   - GET    /api/admin/reviews/:id      — 审核详情（含问卷内容）
 *   - POST   /api/admin/reviews/:id/approve — 审核通过
 *   - POST   /api/admin/reviews/:id/reject  — 审核驳回
 *
 * 所有接口需认证 + super_admin 权限，使用 serverClient
 */
import serverClient from "../../clients/server";
import type { ReviewStatus } from "@common/review/review.interface";
import type { ReviewType } from "@common/review/review.interface";

export type { ReviewStatus, ReviewType };

// ══════════════════════════════════════════════════════════════
//  类型
// ══════════════════════════════════════════════════════════════

interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
}

/** 审核状态标签映射 */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  none: "未审核",
  pending: "审核中",
  approved: "已通过",
  rejected: "已驳回"
};

/** 审核类型标签映射 */
export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  survey: "问卷审核",
  template: "模板审核"
};

/** 审核状态颜色映射（Arco Design Tag） */
export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  none: "gray",
  pending: "orangered",
  approved: "green",
  rejected: "red"
};

/** 审核列表项（对应后端 ReviewListItem，方案B：模板解耦） */
export interface ReviewListItem {
  review_id: string;
  survey_id: string | null;
  template_id: string | null;
  survey_title: string;
  category: string | null;
  submitter_name: string;
  review_type: ReviewType;
  status: ReviewStatus;
  submit_message: string | null;
  submitted_at: string;
}

/** 审核详情（对应后端 ReviewDetail，方案B：模板解耦） */
export interface ReviewDetail {
  review_id: string;
  survey_id: string | null;
  template_id: string | null;
  survey_title: string;
  survey_description: string | null;
  category: string | null;
  submitter_id: string;
  submitter_name: string;
  review_type: ReviewType;
  status: ReviewStatus;
  submit_message: string | null;
  review_comment: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  components: ReviewComponentItem[];
}

/** 审核详情中的组件条目 */
export interface ReviewComponentItem {
  id: string;
  type: string;
  config: Record<string, unknown>;
  order_index: number;
  required: 0 | 1;
}

/** 审核列表查询参数 */
export interface ReviewListQuery {
  review_type?: ReviewType;
  status?: ReviewStatus;
  category?: string;
  page?: number;
  page_size?: number;
}

/** 审核列表响应 */
export interface ReviewListResponse {
  list: ReviewListItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

/** 审核操作响应 */
export interface ReviewActionResponse {
  review_id: string;
  status: ReviewStatus;
  reviewed_at: string;
}

// ══════════════════════════════════════════════════════════════
//  API
// ══════════════════════════════════════════════════════════════

/** GET /api/admin/reviews — 审核列表 */
export const getReviewList = (params?: ReviewListQuery): Promise<ApiResponse<ReviewListResponse>> =>
  serverClient.get("/admin/reviews", { params });

/** GET /api/admin/reviews/:id — 审核详情 */
export const getReviewDetail = (id: string): Promise<ApiResponse<ReviewDetail>> =>
  serverClient.get(`/admin/reviews/${id}`);

/** POST /api/admin/reviews/:id/approve — 审核通过 */
export const approveReview = (
  id: string,
  data?: { review_comment?: string }
): Promise<ApiResponse<ReviewActionResponse>> => serverClient.post(`/admin/reviews/${id}/approve`, data ?? {});

/** POST /api/admin/reviews/:id/reject — 审核驳回 */
export const rejectReview = (
  id: string,
  data: { review_comment: string }
): Promise<ApiResponse<ReviewActionResponse>> => serverClient.post(`/admin/reviews/${id}/reject`, data);
