/**
 * 文件上传接口（引擎共享版）
 *
 * 提供三类上传能力：
 *   1. uploadImage — 旧版通用图片上传（兼容，无文件追踪）
 *   2. uploadSurveyFile — 问卷文件上传（带 survey_id，写入 survey_files 表）
 *   3. uploadSignature — 签名图片上传（canvas blob → MinIO，存储 URL 到 answers）
 *
 * 均通过 serverClient 提交，T014 已为其补齐 response => response.data 拦截器，
 * 因此下方各函数的返回值即为业务信封 ApiResponse<T> 本身，无需再手动解包 .data。
 */
import serverClient from "./clients/server";
import type { ApiResponse } from "../types/common";

// 旧版上传接口（无 survey_id 追踪，兼容保留）
// 注意：后端路由挂载路径为 /api/q-editor/upload（app 级 /api 前缀 + 模块 /q-editor 前缀），
// 而 serverClient 的 baseURL 已经是 /api，此处不能再重复携带 /api 前缀，否则请求会打到 /api/api/q-editor/upload 而 404
const UPLOAD_IMAGE_URL = "/q-editor/upload";

/** 新版问卷文件上传接口（带 media_asset 追踪） */
const UPLOAD_SURVEY_FILE_URL = "/q-editor/survey-file/upload";

/** 签名图片上传接口 */
const UPLOAD_SIGNATURE_URL = "/q-editor/signature/upload";

// 上传超时时间（毫秒），预留足够时间给大文件上传
const UPLOAD_TIMEOUT_MS = 30000;

// 旧版图片上传响应（无文件追踪）
export interface UploadImageResponse {
  // 图片上传成功后的访问地址
  imageUrl: string;
}

/** 问卷文件上传响应（新接口） */
export interface SurveyFileUploadResponse {
  file_id: string;
  file_url: string;
  file_name: string;
  mime_type: string;
  file_size: number;
}

/** 签名上传响应（仅需 file_id + file_url，与 SurveyFileUploadResponse 字段子集一致） */
export interface SignatureUploadResponse {
  file_id: string;
  file_url: string;
}

/**
 * 上传单张图片（遗留接口，无 media_asset 追踪，保留兼容）
 * @param file 待上传的图片文件
 * @returns 业务信封（成功时 data 含 imageUrl 图片访问地址）
 */
export async function uploadImage(file: File): Promise<ApiResponse<UploadImageResponse>> {
  // 与原 el-upload 行为一致：字段名为 image，以 multipart/form-data 形式提交
  const formData = new FormData();
  formData.append("image", file);

  return serverClient.post(UPLOAD_IMAGE_URL, formData, {
    timeout: UPLOAD_TIMEOUT_MS
    // 不手动设置 Content-Type，让 axios 自动生成含 boundary 的 multipart/form-data
  });
}

/**
 * 上传问卷文件（新接口，写入 media_assets 表，带文件追踪）
 *
 * @param file      待上传的文件
 * @param surveyId  所属问卷的远程 ID（BigInt → string），草稿阶段可为空
 * @returns 业务信封（成功时 data 含 file_url / file_id 等）
 */
export async function uploadSurveyFile(file: File, surveyId?: string): Promise<ApiResponse<SurveyFileUploadResponse>> {
  const formData = new FormData();
  formData.append("file", file);
  if (surveyId) {
    formData.append("survey_id", surveyId);
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
 * @returns 业务信封（成功时 data 含 file_url / file_id）
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
