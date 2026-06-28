import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import errorHandlerPlugin from "./plugins/error-handler.js";
import prismaPlugin from "./plugins/prisma.js";
import responsePlugin from "./plugins/response.js";
import redisPlugin from "./plugins/redis.js";
import rabbitmqPlugin from "./plugins/rabbitmq.js";
import mongoPlugin from "./plugins/mongo.js";
import minioPlugin from "./plugins/minio.js";
import clickhousePlugin from "./plugins/clickhouse.js";
import logTransportPlugin from "./plugins/log-transport.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import loggerPlugin from "./utils/logger.js";
import routes from "./routes/index.js";
import { randomUUID } from "node:crypto";

export const buildApp = () => {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      // pino-pretty 开发环境彩色输出，生产环境 JSON
      ...(process.env.LOG_ENV !== "production" && {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" }
        }
      })
    },
    // 请求体大小限制（防止 OOM）
    bodyLimit: 10 * 1024 * 1024, // 10MB（与图片上传限制一致）
    // 请求超时 — 防止 Redis/DB 阻塞导致请求永久挂起
    requestTimeout: Number(process.env.REQUEST_TIMEOUT ?? 30000), // 30s
    // 连接超时 — 防止恶意连接占用资源（0 表示禁用，减少与 requestTimeout 冲突）
    connectionTimeout: 0,
    // Keep-Alive 超时 — 长连接空闲超时
    keepAliveTimeout: Number(process.env.KEEP_ALIVE_TIMEOUT ?? 72000) // 72s
  });

  // ── 全局 requestId 钩子（全链路追踪） ──────────────────────
  app.addHook("onRequest", async (request, reply) => {
    // 优先使用请求头传入的 traceId（网关/上游传递），否则自动生成
    const traceId =
      (request.headers["x-trace-id"] as string) || (request.headers["x-request-id"] as string) || randomUUID();
    request.id = traceId;
    // 响应头回传 traceId，方便前端关联
    reply.header("x-trace-id", traceId);
  });

  // ── 请求超时处理钩子 ──────────────────────────────────────
  app.addHook("onTimeout", async (request, reply) => {
    request.log.warn({ url: request.url, method: request.method }, "请求超时");
    if (!reply.sent) {
      reply.status(408).send({
        data: null,
        code: 408,
        msg: "请求处理超时，请稍后重试"
      });
    }
  });

  app
    // 全局错误处理 — 最先注册，兜底所有后续插件和路由的错误
    .register(errorHandlerPlugin)
    .register(helmet)
    .register(cors, { origin: process.env.CORS_ORIGIN ?? true })
    .register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }) // 10MB 文件上传限制
    .register(prismaPlugin)
    .register(responsePlugin)
    .register(redisPlugin)
    .register(rabbitmqPlugin)
    .register(minioPlugin)
    // ClickHouse（埋点存储，非阻塞业务）
    .register(clickhousePlugin)
    // MongoDB（日志存储，非阻塞业务）
    .register(mongoPlugin)
    // 日志传输（依赖 rabbitmq 先注册，仅生产环境推 RabbitMQ）
    .register(logTransportPlugin)
    // 结构化日志插件（自动为 request.log 添加脱敏能力）
    .register(loggerPlugin)
    // 接口限流（依赖 redis，生产环境共享计数，开发环境内存计数）
    .register(rateLimitPlugin)
    .register(routes, { prefix: "/api" });

  return app;
};
