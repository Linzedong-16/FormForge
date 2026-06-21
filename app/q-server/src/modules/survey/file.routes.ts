/**
 * 问卷文件路由 — CRUD 端点
 *
 * 挂载于 /api（无额外前缀）
 *   GET    /surveys/:id/files   — 问卷文件列表
 *   DELETE /survey-files/:id    — 删除单个文件
 *
 * 上传端点见 upload.routes.ts（挂载于 /api/q-editor）。
 * 所有接口均需认证。
 */
import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../user/auth.middleware.js";
import { SurveyFileService } from "./file.service.js";
import { surveyIdSchema, fileIdSchema, fileListQuerySchema } from "./file.schemas.js";
import { AppError } from "../../utils/errors.js";
import { parseQueryAndRespond } from "../../utils/zod.js";

const fileRoutes: FastifyPluginAsync = async fastify => {
  const fileService = new SurveyFileService(fastify);

  // 所有接口均需认证
  fastify.addHook("preHandler", authenticate);

  // ══════════════════════════════════════════════════════════════
  //  GET /surveys/:id/files — 问卷文件列表
  // ══════════════════════════════════════════════════════════════
  fastify.get(
    "/surveys/:id/files",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const surveyResult = surveyIdSchema.safeParse(id);
      if (!surveyResult.success) {
        throw new AppError("问卷 ID 格式错误", 400);
      }

      const query = parseQueryAndRespond(fileListQuerySchema.safeParse(request.query), reply);
      if (!query) return;

      const result = await fileService.list(request.user!.userId, surveyResult.data, query.file_type);
      return reply.sendSuccess(result);
    }
  );

  // ══════════════════════════════════════════════════════════════
  //  DELETE /survey-files/:id — 删除单个文件
  // ══════════════════════════════════════════════════════════════
  fastify.delete(
    "/survey-files/:id",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const fileResult = fileIdSchema.safeParse(id);
      if (!fileResult.success) {
        throw new AppError("文件 ID 格式错误", 400);
      }

      await fileService.deleteFile(request.user!.userId, fileResult.data);
      return reply.sendSuccess(null, "文件删除成功");
    }
  );
};

export default fileRoutes;
