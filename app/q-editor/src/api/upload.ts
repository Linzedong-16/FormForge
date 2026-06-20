/**
 * 图片上传接口
 *
 * 从 PicItem.vue 中 el-upload 内置的上传逻辑（action="/api/q-editor/upload"）提取而来，
 * 统一收敛到 api 层，使用 serverClient 复用 Token 认证与错误处理拦截器。
 */
import serverClient from "./clients/server";

// 上传图片的接口地址
const UPLOAD_IMAGE_URL = "/api/q-editor/upload";

// 上传超时时间（毫秒），预留足够时间给大文件上传
const UPLOAD_TIMEOUT_MS = 30000;

// 后端上传成功后返回的数据结构
export interface UploadImageResponse {
  // 图片上传成功后的访问地址
  imageUrl: string;
  [key: string]: unknown;
}

/**
 * 上传单张图片
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
