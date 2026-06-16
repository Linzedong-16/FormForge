import fp from "fastify-plugin";
import { PrismaClient } from "../generated/prisma/client.js";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = async fastify => {
  const isDevelopment = process.env.NODE_ENV === "development";

  // 连接池配置 — 生产环境调高并发连接数
  const connectionLimit = Number(process.env.PRISMA_CONNECTION_LIMIT ?? 50);
  const poolTimeout = Number(process.env.PRISMA_POOL_TIMEOUT ?? 10);

  const prisma = new PrismaClient({
    log: isDevelopment ? ["query", "info", "warn", "error"] : ["warn", "error"],
    datasources: {
      db: {
        url: `${process.env.DATABASE_URL}?connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}`
      }
    }
  });

  // 开发环境显示查询日志
  if (isDevelopment) {
    prisma.$on("query", e => {
      console.log("Query:", e.query);
      console.log("Duration:", `${e.duration}ms`);
    });
  }

  try {
    await prisma.$connect();
    fastify.log.info(`Prisma 已连接（连接池: ${connectionLimit}, 超时: ${poolTimeout}s）`);
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
