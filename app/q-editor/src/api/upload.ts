/**
 * 图片上传接口
 *
 * 从 PicItem.vue 中 el-upload 内置的上传逻辑（action="/api/q-editor/upload"）提取而来，
 * 统一收敛到 api 层，便于后期维护与复用。
 * 使用浏览器原生 fetch + FormData 实现，无需 axios，也无需额外安装依赖。
 */

// 上传图片的接口地址（与原 el-upload 的 action 保持一致）
const UPLOAD_IMAGE_URL = "/api/q-editor/upload";

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
  // 注意：使用 FormData 时不要手动设置 Content-Type，浏览器会自动附带 boundary
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(UPLOAD_IMAGE_URL, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`图片上传失败：${response.status} ${response.statusText}`);
  }

  return response.json();
}
