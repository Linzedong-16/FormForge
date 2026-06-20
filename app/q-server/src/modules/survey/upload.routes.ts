/**
 * 文件上传路由 — 挂载于 /api/q-editor
 *
 * 提供图片上传能力，支持 PicItem 组件的封面图片上传。
 * 使用 @fastify/multipart 解析 multipart/form-data。
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../user/auth.middleware.js";
import { uploadToMinio } from "../../utils/upload.js";
import { AppError } from "../../utils/errors.js";

/** 允许的图片 MIME 类型 */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp"];

/** 上传文件大小限制：10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const uploadRoutes: FastifyPluginAsync = async fastify => {
  // 上传接口需要认证
  fastify.addHook("preHandler", authenticate);

  // ── POST /q-editor/upload — 上传图片 ────────────────────────
  fastify.post("/upload", async (request, reply) => {
    const data = await request.file();

    if (!data) {
      throw new AppError("请选择要上传的文件", 400);
    }

    // 校验文件类型
    if (!ALLOWED_IMAGE_TYPES.includes(data.mimetype)) {
      throw new AppError(`不支持的文件类型: ${data.mimetype}，仅支持 jpg/png/gif/webp/svg/bmp`, 400);
    }

    // 读取文件内容
    const buffer = await data.toBuffer();

    // 校验文件大小
    if (buffer.length > MAX_FILE_SIZE) {
      throw new AppError("文件大小不能超过 10MB", 400);
    }

    // 上传到 MinIO
    const imageUrl = await uploadToMinio(fastify, buffer, "images", data.filename, data.mimetype);

    return reply.sendSuccess({ imageUrl }, "上传成功");
  });
};

export default uploadRoutes;
