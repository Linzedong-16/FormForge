/**
 * 文件上传路由 — 挂载于 /api/q-editor
 *
 * 提供图片上传能力，支持 PicItem 组件的封面图片上传。
 * 使用 @fastify/multipart 解析 multipart/form-data。
 */

import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../user/auth.middleware.js";
import { uploadToMinio } from "../../utils/upload.js";
import { createAuditLog } from "../../utils/audit-log.js";
import { AppError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { SurveyFileService } from "./file.service.js";
import { surveyIdSchema } from "./file.schemas.js";
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE, MAX_SIGNATURE_SIZE } from "@common/survey/survey-file.interface.js";

/** multipart 字段值：Fastify 将 form-data 字段包装为 { value: T } */
interface MultipartFieldValue<T = string> {
  value: T;
}

const uploadRoutes: FastifyPluginAsync = async fastify => {
  const fileService = new SurveyFileService(fastify);

  // 上传接口需要认证
  fastify.addHook("preHandler", authenticate);

  // ── POST /q-editor/upload — 上传图片（旧接口，兼容） ──────────
  fastify.post(
    "/upload",
    {
      config: {
        // 请求体大小限制 10MB，在读取 buffer 之前就拒绝超大文件，防止内存耗尽
        bodyLimit: MAX_FILE_SIZE
      }
    },
    async (request, reply) => {
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

      // 审计日志
      createAuditLog(fastify, request.user!.userId, "upload_image", "minio", null, {
        filename: data.filename,
        mimetype: data.mimetype,
        size: buffer.length,
        url: imageUrl
      }).catch(() => {});

      return reply.sendSuccess({ imageUrl }, "上传成功");
    }
  );

  // ── POST /q-editor/survey-file/upload — 问卷文件上传（新接口） ──
  fastify.post(
    "/survey-file/upload",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" },
        bodyLimit: MAX_FILE_SIZE
      }
    },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        throw new AppError("请选择要上传的文件", 400);
      }

      // 获取 survey_id（multipart 字段）
      const surveyIdRaw = (data.fields?.survey_id as MultipartFieldValue | undefined)?.value;
      if (!surveyIdRaw) {
        throw new AppError("缺少问卷 ID 参数", 400);
      }

      const surveyResult = surveyIdSchema.safeParse(surveyIdRaw);
      if (!surveyResult.success) {
        throw new AppError("问卷 ID 格式错误", 400);
      }

      // 校验 MIME 类型
      if (!ALLOWED_IMAGE_TYPES.includes(data.mimetype)) {
        throw new AppError(
          `不支持的文件类型: ${data.mimetype}，仅支持 jpg/png/gif/webp/svg/bmp`,
          400,
          BizCode.UNSUPPORTED_FILE_TYPE
        );
      }

      const buffer = await data.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        throw new AppError(`文件大小不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400, BizCode.FILE_TOO_LARGE);
      }

      const fileTypeRaw = (data.fields?.file_type as MultipartFieldValue | undefined)?.value;
      const result = await fileService.upload(
        request.user!.userId,
        surveyResult.data,
        buffer,
        data.mimetype,
        data.filename,
        fileTypeRaw || "survey_option_image"
      );

      return reply.sendSuccess(result, "上传成功");
    }
  );

  // ── POST /q-editor/signature/upload — 签名图片上传（新接口） ──
  fastify.post(
    "/signature/upload",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
        bodyLimit: MAX_SIGNATURE_SIZE
      }
    },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        throw new AppError("请选择要上传的签名图片", 400);
      }

      const surveyIdRaw = (data.fields?.survey_id as MultipartFieldValue | undefined)?.value;
      if (!surveyIdRaw) {
        throw new AppError("缺少问卷 ID 参数", 400);
      }

      const surveyResult = surveyIdSchema.safeParse(surveyIdRaw);
      if (!surveyResult.success) {
        throw new AppError("问卷 ID 格式错误", 400);
      }

      // 仅 PNG
      if (data.mimetype !== "image/png") {
        throw new AppError("签名图片仅支持 PNG 格式", 400, BizCode.UNSUPPORTED_FILE_TYPE);
      }

      const buffer = await data.toBuffer();
      if (buffer.length > MAX_SIGNATURE_SIZE) {
        throw new AppError(`签名图片大小不能超过 ${MAX_SIGNATURE_SIZE / 1024 / 1024}MB`, 400, BizCode.FILE_TOO_LARGE);
      }

      const result = await fileService.uploadSignature(request.user!.userId, surveyResult.data, buffer);
      return reply.sendSuccess(result, "签名上传成功");
    }
  );
};

export default uploadRoutes;
