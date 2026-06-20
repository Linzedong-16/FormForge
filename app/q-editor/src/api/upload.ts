/**
 * 图片上传接口
 *
 * 从 PicItem.vue 中 el-upload 内置的上传逻辑（action="/api/q-editor/upload"）提取而来，
 * 统一收敛到 api 层，便于后期维护与复用。
 * 使用浏览器原生 fetch + FormData + AbortController 实现，无需 axios。
 */

// 上传图片的接口地址（与原 el-upload 的 action 保持一致）
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
  // 注意：使用 FormData 时不要手动设置 Content-Type，浏览器会自动附带 boundary
  const formData = new FormData();
  formData.append("image", file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(UPLOAD_IMAGE_URL, {
      method: "POST",
      body: formData,
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.msg ?? `${response.status} ${response.statusText}`;
      throw new Error(`图片上传失败：${message}`);
    }

    return response.json();
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("图片上传超时，请检查网络后重试");
    }
    if (err instanceof TypeError && err.message.includes("fetch")) {
      throw new Error("网络连接失败，请检查网络后重试");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
