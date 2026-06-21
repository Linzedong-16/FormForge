/**
 * AI 问卷生成路由 — SSE 端点
 *
 * 挂载于 /api
 *   POST /surveys/generate — AI 一键生成问卷（SSE 流式响应）
 *
 * 限流：3 次/分钟/用户
 * 超时：60 秒
 */
import type { FastifyPluginAsync } from "fastify";
import { authenticate } from "../user/auth.middleware.js";
import { AIGenerateService } from "./ai-generate.service.js";
import { generateSurveySchema } from "./ai-generate.schemas.js";
import { parseAndRespond } from "../../utils/zod.js";
import { AppError } from "../../utils/errors.js";

const aiGenerateRoutes: FastifyPluginAsync = async fastify => {
  const aiService = new AIGenerateService(fastify);

  // 需要认证
  fastify.addHook("preHandler", authenticate);

  // ══════════════════════════════════════════════════════════════
  //  POST /surveys/generate — AI 生成问卷（SSE 流式）
  // ══════════════════════════════════════════════════════════════
  fastify.post(
    "/surveys/generate",
    {
      config: {
        rateLimit: { max: 3, timeWindow: "1 minute" }
      }
    },
    async (request, reply) => {
      // 1. 校验请求体
      const body = parseAndRespond(generateSurveySchema.safeParse(request.body), reply);
      if (!body) return;

      // 2. 设置 SSE 响应头
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no" // 禁用 Nginx 缓冲
      });

      // 3. 创建客户端断开信号（用于及时终止 LangChain 流）
      const clientController = new AbortController();
      const onClientClose = () => clientController.abort();
      request.raw.once("close", onClientClose);

      // 4. 流式推送 SSE 事件
      try {
        for await (const sseEvent of aiService.generate(
          request.user!.userId,
          {
            prompt: body.prompt,
            count: body.count,
            language: body.language
          },
          clientController.signal // 透传给 Service，客户端断开时终止 API 调用
        )) {
          if (clientController.signal.aborted) break;

          const line = `event: ${sseEvent.event}\ndata: ${JSON.stringify(sseEvent.data)}\n\n`;
          reply.raw.write(line);
        }
      } catch (err) {
        // 未预料的异常（Service 已内聚大部分错误处理，此处仅兜底）
        if (!clientController.signal.aborted) {
          const msg = err instanceof AppError ? err.message : "AI 生成失败，请稍后重试";
          reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
        }
      } finally {
        // 清理事件监听器，防止内存泄漏
        request.raw.removeListener("close", onClientClose);
      }

      // 5. 安全结束响应（双检查避免 EPIPE）
      if (!reply.raw.writableEnded && reply.raw.writable) {
        reply.raw.end();
      }
    }
  );
};

export default aiGenerateRoutes;
