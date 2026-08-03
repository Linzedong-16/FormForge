/**
 * AI 服务代理路由 — 转发到 Python ai-service（FastAPI，默认 :8090）
 *
 * 挂载前缀：/api/ai（在 routes/index.ts 中注册）
 *
 * 设计背景：ai-service 作为独立微服务不直接暴露给前端，统一由 q-server
 * 代理转发，复用现有的登录鉴权体系，避免 Python 服务额外实现一套用户鉴权。
 *
 *   GET  /health                — → ai-service GET  /health
 *   GET  /agent/types           — → ai-service GET  /api/v1/agent/types
 *   POST /agent/chat            — → ai-service POST /api/v1/agent/chat
 *   POST /agent/chat/stream     — → ai-service POST /api/v1/agent/chat/stream（SSE 透传）
 *   POST /agent/analysis        — → ai-service POST /api/v1/agent/analysis
 *   POST /agent/analysis/stream — → ai-service POST /api/v1/agent/analysis/stream（SSE 透传）
 *
 * 鉴权分层：
 *   - 通用对话接口（health/types/chat）：仅需登录（authenticate）
 *   - 分析接口（analysis）：涉及问卷统计数据，需超级管理员权限（requireSuperAdmin），
 *     ai-service 随后回调 q-server 的 /api/admin/stats/* 时使用内部服务凭证
 *     （详见 auth.middleware.ts 的 requireSuperAdminOrInternal），不再重复校验用户身份
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { authenticate, requireSuperAdmin } from "../user/auth/auth.middleware.js";
import { AppError } from "../../utils/errors.js";

const AI_SERVICE_BASE_URL = (process.env.AI_SERVICE_BASE_URL ?? "http://localhost:8090").replace(/\/$/, "");
const AI_SERVICE_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 30000);

/** SSE 流式端点统一以 /stream 结尾 */
function isStreamPath(targetPath: string): boolean {
  return targetPath.endsWith("/stream");
}

/**
 * 将请求转发到 ai-service。
 * 普通接口：等待完整响应后按原样返回 JSON；
 * 流式接口（/stream）：逐块透传响应体，不做缓冲，保证 SSE 实时性。
 */
async function proxyToAiService(request: FastifyRequest, reply: FastifyReply, targetPath: string): Promise<void> {
  const url = `${AI_SERVICE_BASE_URL}${targetPath}`;
  const isStream = isStreamPath(targetPath);

  // 客户端断开或超时时统一中止上游请求，避免 ai-service 端产生孤儿请求
  const controller = new AbortController();
  const onClientClose = () => controller.abort();
  request.raw.once("close", onClientClose);
  const timeoutTimer = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        // 透传链路追踪 ID，便于跨服务日志关联排查
        "X-Trace-Id": request.id
      },
      body: ["GET", "HEAD"].includes(request.method) ? undefined : JSON.stringify(request.body ?? {}),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutTimer);
    request.raw.removeListener("close", onClientClose);
    request.log.warn({ err, url }, "ai-service 不可达");
    throw new AppError("AI 服务暂不可用，请稍后重试", 503);
  }
  clearTimeout(timeoutTimer);

  // 非流式接口：上游返回非 2xx 时，直接转换为业务错误抛出，交由全局错误处理格式化
  if (!isStream && !upstream.ok) {
    request.raw.removeListener("close", onClientClose);
    const errorBody = await upstream.text().catch(() => "");
    throw new AppError(errorBody || "AI 服务处理失败", upstream.status);
  }

  if (isStream) {
    reply.raw.writeHead(upstream.status, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const reader = upstream.body?.getReader();
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || controller.signal.aborted) break;
          reply.raw.write(value);
        }
      } catch (err) {
        request.log.warn({ err }, "ai-service SSE 转发中断");
      }
    }

    request.raw.removeListener("close", onClientClose);
    if (!reply.raw.writableEnded && reply.raw.writable) reply.raw.end();
    return;
  }

  request.raw.removeListener("close", onClientClose);
  const data = await upstream.json();
  reply.status(upstream.status).send(data);
}

const aiProxyRoutes: FastifyPluginAsync = async fastify => {
  // ── 通用对话类接口：登录用户即可调用 ──────────────────────
  await fastify.register(async chatScope => {
    chatScope.addHook("preHandler", authenticate);

    chatScope.get("/health", (req, reply) => proxyToAiService(req, reply, "/health"));
    chatScope.get("/agent/types", (req, reply) => proxyToAiService(req, reply, "/api/v1/agent/types"));

    chatScope.post("/agent/chat", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, (req, reply) =>
      proxyToAiService(req, reply, "/api/v1/agent/chat")
    );
    chatScope.post("/agent/chat/stream", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, (req, reply) =>
      proxyToAiService(req, reply, "/api/v1/agent/chat/stream")
    );
  });

  // ── 分析类接口：涉及问卷统计数据，仅超级管理员可用 ─────────
  await fastify.register(async analysisScope => {
    analysisScope.addHook("preHandler", authenticate);
    analysisScope.addHook("preHandler", requireSuperAdmin);

    analysisScope.post(
      "/agent/analysis",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      (req, reply) => proxyToAiService(req, reply, "/api/v1/agent/analysis")
    );
    analysisScope.post(
      "/agent/analysis/stream",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      (req, reply) => proxyToAiService(req, reply, "/api/v1/agent/analysis/stream")
    );
  });
};

export default aiProxyRoutes;
