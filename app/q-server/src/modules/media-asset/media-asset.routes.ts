/**
 * 物料（图片资源）管理模块 — 路由定义（管理员接口）
 *
 * 挂载前缀：/api/admin（在 routes/index.ts 中注册，最终路径 /api/admin/media-assets）
 * 所有接口需认证 + 超级管理员权限（含审核状态变更接口——预留给未来自动化审核 Agent 的调用方
 * 同样需要持有等效授权，不开无鉴权旁路，详见 research.md 决策 5）
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { authenticate, requireSuperAdmin } from "../user/auth/auth.middleware.js";
import { MediaAssetService } from "./media-asset.service.js";
import {
  mediaAssetIdSchema,
  mediaAssetListQuerySchema,
  updateMediaAssetSchema,
  batchDeleteMediaAssetsSchema,
  changeReviewStatusSchema
} from "./media-asset.schemas.js";
import { parseAndRespond, parseQueryAndRespond } from "../../utils/zod.js";
import { AppError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE } from "@common/survey/survey-file.interface.js";

/** multipart 字段值：Fastify 将 form-data 字段包装为 { value: T } */
interface MultipartFieldValue<T = string> {
  value: T;
}

/** 解析并校验物料 ID，非法格式返回 400 */
function parseMediaAssetId(id: string, reply: FastifyReply): bigint | null {
  const result = mediaAssetIdSchema.safeParse(id);
  if (!result.success) {
    reply.status(400).send({ data: null, code: 400, msg: "物料 ID 格式错误" });
    return null;
  }
  return result.data;
}

const mediaAssetRoutes: FastifyPluginAsync = async fastify => {
  const mediaAssetService = new MediaAssetService(fastify);

  // 全部接口均需认证 + 超级管理员权限
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("preHandler", requireSuperAdmin);

  // ════════════════════════════════════════════════════════════
  // GET /media-assets — 物料列表（分页 + 筛选）
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/media-assets",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const query = parseQueryAndRespond(mediaAssetListQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      try {
        const result = await mediaAssetService.listMediaAssets(query);
        return reply.sendSuccess(result);
      } catch (err) {
        fastify.log.error({ err }, "[media-asset] GET /media-assets — 查询失败");
        throw err;
      }
    }
  );

  // ════════════════════════════════════════════════════════════
  // GET /media-assets/:id — 物料详情（含引用检测）
  // ════════════════════════════════════════════════════════════
  fastify.get(
    "/media-assets/:id",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const assetId = parseMediaAssetId(id, reply);
      if (assetId === null) return;

      const result = await mediaAssetService.getMediaAssetById(assetId);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // PUT /media-assets/:id — 更新元信息
  // ════════════════════════════════════════════════════════════
  fastify.put(
    "/media-assets/:id",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const assetId = parseMediaAssetId(id, reply);
      if (assetId === null) return;

      const body = parseAndRespond(updateMediaAssetSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await mediaAssetService.updateMediaAsset(assetId, body, request.user!.userId);
      return reply.sendSuccess(result, "更新成功");
    }
  );

  // ════════════════════════════════════════════════════════════
  // PUT /media-assets/:id/review-status — 变更审核状态
  // ════════════════════════════════════════════════════════════
  fastify.put(
    "/media-assets/:id/review-status",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const assetId = parseMediaAssetId(id, reply);
      if (assetId === null) return;

      const body = parseAndRespond(changeReviewStatusSchema.safeParse(request.body), reply);
      if (!body) return;

      const result = await mediaAssetService.changeReviewStatus(assetId, body, request.user!.userId);
      return reply.sendSuccess(result, "审核状态已更新");
    }
  );

  // ════════════════════════════════════════════════════════════
  // DELETE /media-assets/:id — 删除（存在有效引用时阻止）
  // ════════════════════════════════════════════════════════════
  fastify.delete(
    "/media-assets/:id",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const assetId = parseMediaAssetId(id, reply);
      if (assetId === null) return;

      const references = await mediaAssetService.deleteMediaAsset(assetId, request.user!.userId);
      if (references !== null) {
        // 前端全局响应拦截器只在 2xx 状态下保留完整的 {code,msg,data} 信封，
        // 非 2xx 会被统一转换为丢失 data 的通用 Error——本场景需要把 references
        // 传给前端渲染引用来源，因此故意用 200 + 非零 code 承载这个"业务软失败"，
        // 而不是 HTTP 409，调用方按 code 而非 HTTP 状态判断是否真正成功
        return reply.status(200).send({
          data: { references },
          code: BizCode.MEDIA_ASSET_REFERENCED,
          msg: "该物料仍被引用，请先解除引用后再删除"
        });
      }
      return reply.sendSuccess(null, "删除成功");
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /media-assets/batch-delete — 批量删除
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/media-assets/batch-delete",
    { config: { rateLimit: { max: 100, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = parseAndRespond(batchDeleteMediaAssetsSchema.safeParse(request.body), reply);
      if (!body) return;

      const ids = body.ids.map(id => BigInt(id));
      const result = await mediaAssetService.batchDeleteMediaAssets(ids, request.user!.userId);
      return reply.sendSuccess(result);
    }
  );

  // ════════════════════════════════════════════════════════════
  // POST /media-assets/upload — 直接上传新物料
  // ════════════════════════════════════════════════════════════
  fastify.post(
    "/media-assets/upload",
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

      if (!ALLOWED_IMAGE_TYPES.includes(data.mimetype)) {
        throw new AppError(`当前阶段仅支持图片类型文件，不支持: ${data.mimetype}`, 415, BizCode.UNSUPPORTED_FILE_TYPE);
      }

      const buffer = await data.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        throw new AppError(`文件大小不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400, BizCode.FILE_TOO_LARGE);
      }

      const surveyIdRaw = (data.fields?.survey_id as MultipartFieldValue | undefined)?.value;
      const surveyId = surveyIdRaw && /^\d+$/.test(surveyIdRaw) ? BigInt(surveyIdRaw) : undefined;

      const result = await mediaAssetService.uploadMediaAsset(
        request.user!.userId,
        buffer,
        data.mimetype,
        data.filename,
        surveyId
      );
      return reply.status(201).send({ data: result, code: 0, msg: "上传成功" });
    }
  );
};

export default mediaAssetRoutes;
