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

  const prisma = new PrismaClient({
    log: isDevelopment
      ? ["query", "info", "warn", "error"] // 开发环境：显示所有日志
      : ["warn", "error"] // 生产环境：只显示警告和错误
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
    fastify.log.info("Prisma connected successfully");
  } catch (error: unknown) {
    fastify.log.error("Prisma connection failed:");
    throw error;
  }

  fastify.decorate("prisma", prisma);

  fastify.addHook("onClose", async () => {
    await prisma.$disconnect();
    fastify.log.info("Prisma disconnected");
  });
};

export default fp(prismaPlugin, { name: "prisma" });
