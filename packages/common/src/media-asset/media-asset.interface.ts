// ──────────────────────────────────────────────────────────────────────────────
// 物料（图片资源）管理模块 — 前后端通用 TypeScript 类型与接口定义
//
// 所有类型严格对齐后端 Prisma schema：media_assets 表（原 survey_files 演进而来）
//
// 规范：
//   - BigInt 字段在 JSON 序列化后以 string 返回
//   - 字段命名与数据库列名一致（snake_case），与项目其余共享接口（如 review.interface.ts）保持统一
// ──────────────────────────────────────────────────────────────────────────────

import type { ReviewStatus } from "../survey/survey.interface.js";
import type { FileType } from "../survey/survey-file.interface.js";

export type { ReviewStatus, FileType };

// ============================================================
//  1. 物料条目
// ============================================================

/** 物料的一处有效引用来源 */
export interface MediaAssetReference {
  /** 引用类型：问卷题目配置 / 用户当前头像 */
  type: "survey_component" | "user_avatar";
  survey_id?: string;
  survey_title?: string;
  component_id?: string;
  user_id?: string;
}

/** 物料列表条目 */
export interface MediaAssetItem {
  id: string;
  resource_type: string;
  file_url: string;
  file_key: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  file_type: FileType;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  user_id: string;
  survey_id: string | null;
  created_at: string;
  updated_at: string;
}

/** 物料详情（列表条目 + 当前有效引用来源） */
export interface MediaAssetDetail extends MediaAssetItem {
  references: MediaAssetReference[];
}

// ============================================================
//  2. API 请求/响应类型
// ============================================================

/** GET /api/admin/media-assets — 列表查询参数 */
export interface MediaAssetListQuery {
  page?: number;
  page_size?: number;
  user_id?: string;
  survey_id?: string;
  review_status?: ReviewStatus;
  resource_type?: string;
  keyword?: string;
}

/** GET /api/admin/media-assets — 列表响应 */
export interface MediaAssetListResponse {
  list: MediaAssetItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

/** PUT /api/admin/media-assets/:id — 更新元信息请求（不接受替换 file_url/file_key） */
export interface UpdateMediaAssetRequest {
  resource_type?: string;
  survey_id?: string | null;
}

/** DELETE /api/admin/media-assets/:id — 删除失败（存在有效引用）响应 data */
export interface MediaAssetDeleteBlockedData {
  references: MediaAssetReference[];
}

/** POST /api/admin/media-assets/batch-delete — 请求体 */
export interface BatchDeleteMediaAssetsRequest {
  ids: string[];
}

/** 批量删除单项失败原因 */
export interface BatchDeleteFailure {
  id: string;
  reason: "referenced" | "not_found" | "storage_error";
  references?: MediaAssetReference[];
}

/** POST /api/admin/media-assets/batch-delete — 响应 */
export interface BatchDeleteMediaAssetsResponse {
  succeeded: string[];
  failed: BatchDeleteFailure[];
}

/** PUT /api/admin/media-assets/:id/review-status — 请求体 */
export interface ChangeReviewStatusRequest {
  review_status: ReviewStatus;
  review_comment?: string;
}
