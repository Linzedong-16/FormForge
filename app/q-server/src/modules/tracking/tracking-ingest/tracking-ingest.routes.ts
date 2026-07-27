/**
 * 埋点上报路由 — 接收前端 SDK 的事件数据
 *
 * 挂载前缀：/api/v1（在 routes/index.ts 中注册）
 *
 * 接口列表：
 *   POST /api/v1/track        — 单条事件上报（错误事件，立即发送）
 *   POST /api/v1/track/batch  — 批量事件上报（行为/性能事件，缓冲后批量）
 *
 * 设计要点：
 *   - 极速返回 204，不阻塞客户端
 *   - 不需要用户认证（SDK 公开上报）
 *   - 通过 IP 限流防止滥用（60 次/秒）
 *   - body 大小限制（单条 < 10KB，批量 < 512KB）
 */

import type { FastifyPluginAsync } from "fastify";
import { TrackingIngestService } from "./tracking-ingest.service.js";
import { trackSingleSchema, trackBatchSchema } from "./tracking-ingest.schemas.js";
import { parseAndRespond } from "../../../utils/zod.js";

const trackingIngestRoutes: FastifyPluginAsync = async fastify => {
  const ingestService = new TrackingIngestService(fastify);

  // ════════════════════════════════════════════════════════════════
  // POST /track — 单条事件上报（错误事件优先通道）
  // ════════════════════════════════════════════════════════════════

  fastify.post(
    "/track",
    {
      config: {
        rateLimit: { max: 60, timeWindow: "1 second" }
      },
      bodyLimit: 10 * 1024 // 10KB
    },
    async (request, reply) => {
      const body = parseAndRespond(trackSingleSchema.safeParse(request.body), reply);
      if (!body) return;

      // 异步处理，不等待完成即返回
      ingestService.ingestSingle(body, request).catch(err => {
        fastify.log.error(`tracking ingest error: ${(err as Error).message}`);
      });

      return reply.status(204).send();
    }
  );

  // ════════════════════════════════════════════════════════════════
  // POST /track/batch — 批量事件上报
  // ════════════════════════════════════════════════════════════════

  fastify.post(
    "/track/batch",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 second" }
      },
      bodyLimit: 512 * 1024 // 512KB
    },
    async (request, reply) => {
      const body = parseAndRespond(trackBatchSchema.safeParse(request.body), reply);
      if (!body) return;

      // 异步处理，不等待完成即返回
      ingestService.ingestBatch(body.events, request).catch(err => {
        fastify.log.error(`tracking batch ingest error: ${(err as Error).message}`);
      });

      return reply.status(204).send();
    }
  );
};

export default trackingIngestRoutes;
