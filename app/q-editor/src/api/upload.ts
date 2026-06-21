/**
 * 文件上传接口
 *
 * 提供三类上传能力：
 *   1. uploadImage — 旧版通用图片上传（兼容，无文件追踪）
 *   2. uploadSurveyFile — 问卷文件上传（带 survey_id，写入 survey_files 表）
 *   3. uploadSignature — 签名图片上传（canvas blob → MinIO，存储 URL 到 answers）
 *
 * 均使用 serverClient（已内置 Token 认证 + 401 自动刷新 + 错误提示）。
 *
 * 类型定义统一来自 @common/survey/survey-file.interface
 */
import serverClient from "./clients/server";
import type { ApiResponse } from "@common/user/user.interface";
import type {
  SurveyFileUploadResponse,
  SignatureUploadResponse,
  ImageUploadResponse
} from "@common/survey/survey-file.interface";

// ─── 常量 ──────────────────────────────────────────────────────

/** 旧版上传接口（无 survey_id 追踪，兼容保留） */
const UPLOAD_IMAGE_URL = "/q-editor/upload";

/** 新版问卷文件上传接口 */
const UPLOAD_SURVEY_FILE_URL = "/q-editor/survey-file/upload";

/** 签名图片上传接口 */
const UPLOAD_SIGNATURE_URL = "/q-editor/signature/upload";

/** 上传超时（ms），预留足够时间给大文件上传 */
const UPLOAD_TIMEOUT_MS = 30000;

// ─── 上传函数 ──────────────────────────────────────────────────

/**
 * 上传单张图片（旧版接口，无文件追踪，向后兼容）
 * @param file 待上传的图片文件
 * @returns API 响应体（含 code / msg / data.imageUrl）
 */
export async function uploadImage(file: File): Promise<ApiResponse<ImageUploadResponse>> {
  const formData = new FormData();
  formData.append("image", file);

  return serverClient.post(UPLOAD_IMAGE_URL, formData, {
    timeout: UPLOAD_TIMEOUT_MS
  });
}

/**
 * 上传问卷文件（新接口，写入 survey_files 表）
 *
 * @param file      待上传的文件
 * @param surveyId  所属问卷的远程 ID（BigInt → string）
 * @param fileType  可选文件类型，默认后端自动设为 survey_option_image
 * @returns API 响应体（含 code / msg / data.file_url 等）
 */
export async function uploadSurveyFile(
  file: File,
  surveyId: string,
  fileType?: string
): Promise<ApiResponse<SurveyFileUploadResponse>> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("survey_id", surveyId);
  if (fileType) {
    formData.append("file_type", fileType);
  }

  return serverClient.post(UPLOAD_SURVEY_FILE_URL, formData, {
    timeout: UPLOAD_TIMEOUT_MS
  });
}

/**
 * 上传签名图片（canvas blob → MinIO）
 *
 * @param file      签名 Canvas 导出的 PNG blob
 * @param surveyId  所属问卷的远程 ID
 * @returns API 响应体（含 code / msg / data.file_url）
 */
export async function uploadSignature(file: Blob, surveyId: string): Promise<ApiResponse<SignatureUploadResponse>> {
  const formData = new FormData();
  // 以 file 字段名上传 blob，指定文件名为 signature.png
  formData.append("file", file, "signature.png");
  formData.append("survey_id", surveyId);

  return serverClient.post(UPLOAD_SIGNATURE_URL, formData, {
    timeout: UPLOAD_TIMEOUT_MS
  });
}
