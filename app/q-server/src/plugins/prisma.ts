import fp from "fastify-plugin";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../generated/prisma/client.js";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = async fastify => {
  const isDevelopment = process.env.NODE_ENV === "development";

  // Prisma v7: 连接池参数通过 pg 驱动适配器配置
  // v6 connection_limit → v7 max, v6 pool_timeout → v7 connectionTimeoutMillis
  const maxConnections = Number(process.env.PRISMA_CONNECTION_LIMIT ?? 50);
  const poolTimeoutSec = Number(process.env.PRISMA_POOL_TIMEOUT ?? 10);

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: maxConnections,
    connectionTimeoutMillis: poolTimeoutSec * 1000
  });

  const prisma = new PrismaClient({
    adapter,
    log: isDevelopment
      ? [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "info" },
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" }
        ]
      : [
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" }
        ]
  }) as PrismaClient<Prisma.LogLevel>;

  // 开发环境显示查询日志
  if (isDevelopment) {
    prisma.$on("query", (e: Prisma.QueryEvent) => {
      console.log("Query:", e.query);
      console.log("Duration:", `${e.duration}ms`);
    });
  }

  try {
    await prisma.$connect();
    fastify.log.info(`Prisma 已连接（连接池: ${maxConnections}, 超时: ${poolTimeoutSec}s）`);
  } catch (error: unknown) {
    fastify.log.error("Prisma 连接失败:");
    throw error;
  }

  fastify.decorate("prisma", prisma);

  fastify.addHook("onClose", async () => {
    await prisma.$disconnect();
    fastify.log.info("Prisma 已断开");
  });
};

export default fp(prismaPlugin, { name: "prisma" });
