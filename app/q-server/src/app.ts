import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import errorHandlerPlugin from "./plugins/error-handler.js";
import prismaPlugin from "./plugins/prisma.js";
import responsePlugin from "./plugins/response.js";
import redisPlugin from "./plugins/redis.js";
import rabbitmqPlugin from "./plugins/rabbitmq.js";
import routes from "./routes/index.js";

export const buildApp = () => {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  app
    // 全局错误处理 — 最先注册，兜底所有后续插件和路由的错误
    .register(errorHandlerPlugin)
    .register(helmet)
    .register(cors, { origin: process.env.CORS_ORIGIN ?? true })
    .register(prismaPlugin)
    .register(responsePlugin)
    .register(redisPlugin)
    .register(rabbitmqPlugin)
    .register(routes, { prefix: "/api" });

  return app;
};
