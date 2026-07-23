/**
 * 物料（图片资源）管理模块 API
 *
 * 封装物料管理相关 API：
 *   - GET    /api/admin/media-assets                 — 物料列表（分页+筛选）
 *   - GET    /api/admin/media-assets/:id              — 物料详情（含引用检测）
 *   - PUT    /api/admin/media-assets/:id              — 更新元信息
 *   - DELETE /api/admin/media-assets/:id              — 删除（存在有效引用时阻止）
 *   - POST   /api/admin/media-assets/batch-delete     — 批量删除
 *   - POST   /api/admin/media-assets/upload           — 直接上传新物料
 *   - PUT    /api/admin/media-assets/:id/review-status — 变更审核状态
 *
 * 所有接口需认证 + super_admin 权限，使用 serverClient
 */
import serverClient from "../../clients/server";
import {
  MEDIA_ASSET_FILE_TYPE_LABELS,
  type ReviewStatus,
  type FileType
} from "@common/media-asset/media-asset.interface";

export type { ReviewStatus, FileType };
export { MEDIA_ASSET_FILE_TYPE_LABELS };

// ══════════════════════════════════════════════════════════════
//  类型
// ══════════════════════════════════════════════════════════════

interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
}

/** 审核状态标签映射 */
export const MEDIA_ASSET_REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  none: "未审核",
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回"
};

/** 审核状态颜色映射（Arco Design Tag） */
export const MEDIA_ASSET_REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  none: "gray",
  pending: "orangered",
  approved: "green",
  rejected: "red"
};

/** 物料的一处有效引用来源 */
export interface MediaAssetReference {
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

/** 物料列表查询参数 */
export interface MediaAssetListQuery {
  page?: number;
  page_size?: number;
  user_id?: string;
  survey_id?: string;
  review_status?: ReviewStatus;
  file_type?: FileType;
  resource_type?: string;
  keyword?: string;
}

/** 物料列表响应 */
export interface MediaAssetListResponse {
  list: MediaAssetItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

/** 更新元信息请求 */
export interface UpdateMediaAssetRequest {
  resource_type?: string;
  survey_id?: string | null;
}

/** 删除被阻止（存在有效引用）时的响应 data */
export interface MediaAssetDeleteBlockedData {
  references: MediaAssetReference[];
}

/** 批量删除单项失败原因 */
export interface BatchDeleteFailure {
  id: string;
  reason: "referenced" | "not_found" | "storage_error";
  references?: MediaAssetReference[];
}

/** 批量删除响应 */
export interface BatchDeleteMediaAssetsResponse {
  succeeded: string[];
  failed: BatchDeleteFailure[];
}

/** 变更审核状态请求 */
export interface ChangeReviewStatusRequest {
  review_status: ReviewStatus;
  review_comment?: string;
}

// ══════════════════════════════════════════════════════════════
//  API
// ══════════════════════════════════════════════════════════════

/** GET /api/admin/media-assets — 物料列表 */
export const getMediaAssetList = (params?: MediaAssetListQuery): Promise<ApiResponse<MediaAssetListResponse>> =>
  serverClient.get("/admin/media-assets", { params });

/** GET /api/admin/media-assets/:id — 物料详情（含引用检测） */
export const getMediaAssetDetail = (id: string): Promise<ApiResponse<MediaAssetDetail>> =>
  serverClient.get(`/admin/media-assets/${id}`);

/** PUT /api/admin/media-assets/:id — 更新元信息 */
export const updateMediaAsset = (id: string, data: UpdateMediaAssetRequest): Promise<ApiResponse<MediaAssetItem>> =>
  serverClient.put(`/admin/media-assets/${id}`, data);

/** DELETE /api/admin/media-assets/:id — 删除（存在有效引用时返回 409，data 含 references） */
export const deleteMediaAsset = (id: string): Promise<ApiResponse<MediaAssetDeleteBlockedData | null>> =>
  serverClient.delete(`/admin/media-assets/${id}`);

/** POST /api/admin/media-assets/batch-delete — 批量删除 */
export const batchDeleteMediaAssets = (ids: string[]): Promise<ApiResponse<BatchDeleteMediaAssetsResponse>> =>
  serverClient.post("/admin/media-assets/batch-delete", { ids });

/** POST /api/admin/media-assets/upload — 直接上传新物料（multipart/form-data） */
export const uploadMediaAsset = (formData: FormData): Promise<ApiResponse<MediaAssetItem>> =>
  serverClient.post("/admin/media-assets/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });

/** PUT /api/admin/media-assets/:id/review-status — 变更审核状态 */
export const changeMediaAssetReviewStatus = (
  id: string,
  data: ChangeReviewStatusRequest
): Promise<ApiResponse<MediaAssetItem>> => serverClient.put(`/admin/media-assets/${id}/review-status`, data);
