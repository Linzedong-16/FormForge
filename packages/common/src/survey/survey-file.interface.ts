// ──────────────────────────────────────────────────────────────────────────────
// 问卷文件模块 — 前后端通用 TypeScript 类型与接口定义
//
// 涵盖两类上传接口：
//   1. 图片选择组件封面图上传 — POST /api/q-editor/survey-file/upload
//   2. 签名 Canvas Blob 上传   — POST /api/q-editor/signature/upload
//   3. 文件列表 / 删除            — GET/DELETE /api/surveys/:id/files
//
// 后端实现：app/q-server/src/modules/survey/file.service.ts
// 前端实现：app/q-editor/src/api/upload.ts
//
// 设计文档：app/q-server/doc/survey/survey-file-and-signature-api-design.md
// ──────────────────────────────────────────────────────────────────────────────

// ============================================================
//  1. 枚举与字面量类型
// ============================================================

/**
 * 问卷文件类型
 *
 * 对应 Prisma FileType 枚举，区分文件来源以支持级联清理与分类查询
 */
export type FileType = "survey_option_image" | "survey_signature" | "survey_cover";

// ============================================================
//  2. 上传常量
// ============================================================

/**
 * 通用文件上传 — 允许的 MIME 类型
 *
 * 前后端校验规则必须一致
 */
export const ALLOWED_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp"
] as const;

/** 通用文件上传大小上限（字节） */
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** 签名文件上传大小上限（字节） */
export const MAX_SIGNATURE_SIZE = 1 * 1024 * 1024; // 1MB

// ============================================================
//  3. 上传请求参数
// ============================================================

/**
 * POST /api/q-editor/survey-file/upload — 问卷文件上传请求
 * multipart/form-data 表单字段
 */
export interface SurveyFileUploadFields {
  /** 文件（multipart 字段名 "file"） */
  file: File | Blob;
  /** 所属问卷 ID（BigInt → string） */
  survey_id: string;
  /** 文件类型，默认 survey_option_image */
  file_type?: FileType;
}

/**
 * POST /api/q-editor/signature/upload — 签名上传请求
 * multipart/form-data 表单字段
 */
export interface SignatureUploadFields {
  /** PNG Blob（multipart 字段名 "file"，固定文件名 signature.png） */
  file: Blob;
  /** 所属问卷 ID（BigInt → string） */
  survey_id: string;
}

// ============================================================
//  4. 响应体
// ============================================================

/**
 * 问卷文件上传响应（通用）
 *
 * 对应后端 SurveyFileService.upload() 返回的 FileUploadResult
 */
export interface SurveyFileUploadResponse {
  /** 文件记录 ID（survey_files.id，BigInt → string） */
  file_id: string;
  /** MinIO 完整访问 URL */
  file_url: string;
  /** 原始文件名 */
  file_name: string;
  /** MIME 类型（如 "image/png"） */
  mime_type: string;
  /** 文件大小（字节） */
  file_size: number;
}

/**
 * 签名上传响应
 *
 * 前端签名组件仅需 file_id + file_url，
 * 后端 uploadSignature() 返回完整 SurveyFileUploadResponse（兼容），
 * 前端按需取前两个字段
 */
export interface SignatureUploadResponse {
  /** 文件记录 ID */
  file_id: string;
  /** MinIO 完整访问 URL */
  file_url: string;
}

/**
 * 旧版图片上传响应（POST /api/q-editor/upload，无文件追踪）
 *
 * @deprecated 新代码应使用 SurveyFileUploadResponse
 */
export interface ImageUploadResponse {
  /** MinIO 图片访问 URL */
  imageUrl: string;
}

// ============================================================
//  5. 文件列表相关
// ============================================================

/**
 * 文件列表查询参数（GET /api/surveys/:id/files）
 */
export interface SurveyFileListQuery {
  /** 可选，按文件类型筛选 */
  file_type?: FileType;
}

/**
 * 单条文件记录
 */
export interface SurveyFileItem {
  /** 文件记录 ID（survey_files.id） */
  id: string;
  /** MinIO 完整访问 URL */
  file_url: string;
  /** 原始文件名 */
  file_name: string;
  /** MIME 类型 */
  mime_type: string;
  /** 文件大小（字节） */
  file_size: number;
  /** 文件类型 */
  file_type: FileType;
  /** 上传时间（ISO 8601） */
  created_at: string;
}

/**
 * GET /api/surveys/:id/files — 文件列表响应
 */
export interface SurveyFileListResponse {
  /** 文件列表 */
  files: SurveyFileItem[];
  /** 文件总数 */
  total: number;
}

// ============================================================
//  6. API 端点类型映射
// ============================================================

/**
 * 问卷文件模块 API 类型映射
 *
 * @example
 * ```ts
 * import type { SurveyFileApi, ApiResponse } from "@common";
 * // 上传响应
 * const res: ApiResponse<SurveyFileApi["uploadSurveyFile"]["response"]> = await ...;
 * // 文件列表响应
 * const list: ApiResponse<SurveyFileApi["getFileList"]["response"]> = await ...;
 * ```
 */
export interface SurveyFileApi {
  /** POST /api/q-editor/survey-file/upload */
  uploadSurveyFile: {
    request: SurveyFileUploadFields;
    response: SurveyFileUploadResponse;
  };
  /** POST /api/q-editor/signature/upload */
  uploadSignature: {
    request: SignatureUploadFields;
    response: SignatureUploadResponse;
  };
  /** POST /api/q-editor/upload（旧接口，向后兼容） */
  uploadImage: {
    request: FormData;
    response: ImageUploadResponse;
  };
  /** GET /api/surveys/:id/files */
  getFileList: {
    request: SurveyFileListQuery;
    response: SurveyFileListResponse;
  };
  /** DELETE /api/survey-files/:id */
  deleteFile: {
    request: void;
    /** 无数据返回 */
    response: null;
  };
}
