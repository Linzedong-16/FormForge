import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import prismaPlugin from "./plugins/prisma.js";
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
    .register(helmet)
    .register(cors, { origin: process.env.CORS_ORIGIN ?? true })
    .register(prismaPlugin)
    .register(redisPlugin)
    .register(rabbitmqPlugin)
    .register(routes, { prefix: "/api" });

  return app;
};
