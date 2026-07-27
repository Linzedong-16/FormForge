/**
 * 图片上传接口
 *
 * 从 PicItem.vue 中 el-upload 内置的上传逻辑（action="/api/q-editor/upload"）提取而来，
 * 统一收敛到 api 层，使用 serverClient 复用 Token 认证与错误处理拦截器。
 */
import serverClient from "./clients/server";

// 上传图片的接口地址
const UPLOAD_IMAGE_URL = "/api/q-editor/upload";

/** 新版问卷文件上传接口（带 media_asset 追踪） */
const UPLOAD_SURVEY_FILE_URL = "/api/q-editor/survey-file/upload";

// 上传超时时间（毫秒），预留足够时间给大文件上传
const UPLOAD_TIMEOUT_MS = 30000;

// 后端上传成功后返回的数据结构
export interface UploadImageResponse {
  // 图片上传成功后的访问地址
  imageUrl: string;
  [key: string]: unknown;
}

/** 问卷文件上传响应（新接口） */
export interface SurveyFileUploadResponse {
  file_id: string;
  file_url: string;
  file_name: string;
  mime_type: string;
  file_size: number;
}

/**
 * 上传单张图片（遗留接口，无 media_asset 追踪，保留兼容）
 * @param file 待上传的图片文件
 * @returns 后端返回的数据（含 imageUrl 图片访问地址）
 */
export async function uploadImage(file: File): Promise<UploadImageResponse> {
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
 * @returns API 响应体（含 file_url / file_id 等）
 */
export async function uploadSurveyFile(file: File, surveyId?: string): Promise<SurveyFileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (surveyId) {
    formData.append("survey_id", surveyId);
  }

  return serverClient.post(UPLOAD_SURVEY_FILE_URL, formData, {
    timeout: UPLOAD_TIMEOUT_MS
  });
}
