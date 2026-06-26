/**
 * AI 问卷润色路由 — SSE 端点
 *
 * 挂载于 /api
 *   POST /surveys/polish — AI 润色问卷（SSE 流式响应）
 *
 * 限流：3 次/分钟/用户
 * 超时：60 秒
 */
import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../../user/auth/auth.middleware.js";
import { AIPolishService } from "./ai-polish.service.js";
import { polishSurveySchema } from "./ai-polish.schemas.js";
import { parseAndRespond } from "../../../utils/zod.js";

const aiPolishRoutes: FastifyPluginAsync = async fastify => {
  const polishService = new AIPolishService(fastify);

  fastify.addHook("preHandler", authenticate);

  fastify.post(
    "/surveys/polish",
    {
      config: {
        rateLimit: { max: 3, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      // 1. 校验请求体
      const body = parseAndRespond(polishSurveySchema.safeParse(request.body), reply);
      if (!body) return;

      // 2. SSE 响应头
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });

      // 3. 客户端断连信号
      const clientController = new AbortController();
      const onClientClose = () => clientController.abort();
      request.raw.once("close", onClientClose);

      try {
        for await (const sseEvent of polishService.polish(
          request.user!.userId,
          {
            surveyContent: body.surveyContent,
            instructions: body.instructions,
            aspects: body.aspects,
            language: body.language
          },
          clientController.signal
        )) {
          if (clientController.signal.aborted) break;
          const line = `event: ${sseEvent.event}\ndata: ${JSON.stringify(sseEvent.data)}\n\n`;
          reply.raw.write(line);
        }
      } catch (err) {
        if (!clientController.signal.aborted) {
          const msg = err instanceof Error ? err.message : "AI 润色失败，请稍后重试";
          reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
        }
      } finally {
        request.raw.removeListener("close", onClientClose);
      }

      if (!reply.raw.writableEnded && reply.raw.writable) {
        reply.raw.end();
      }
    }
  );
};

export default aiPolishRoutes;
