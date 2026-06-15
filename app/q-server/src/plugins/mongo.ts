/**
 * MongoDB 插件 — 通过 Mongoose 建立连接，装饰到 fastify.mongo
 *
 * 与 Prisma（PostgreSQL）完全独立，专用于日志持久化存储。
 * 即使 MongoDB 不可用，业务服务也不受影响（仅在 logger 中降级处理）。
 */
import fp from "fastify-plugin";
import mongoose from "mongoose";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    mongo: typeof mongoose;
  }
}

const mongoPlugin: FastifyPluginAsync = async fastify => {
  const uri = process.env.MONGO_URI ?? "mongodb://admin:admin123@localhost:27017";
  const dbName = process.env.MONGO_DB_NAME ?? "questionnaire_logs";

  try {
    await mongoose.connect(uri, {
      dbName,
      minPoolSize: 2,
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000
    });

    fastify.log.info(`MongoDB 已连接 → ${dbName}`);
  } catch (err) {
    // MongoDB 不可用不应阻断业务启动
    fastify.log.error(`MongoDB 连接失败（日志持久化将降级）: ${(err as Error).message}`);
  }

  // 监听连接状态变化
  mongoose.connection.on("disconnected", () => {
    fastify.log.warn("MongoDB 连接已断开");
  });
  mongoose.connection.on("reconnected", () => {
    fastify.log.info("MongoDB 已重连");
  });

  fastify.decorate("mongo", mongoose);

  fastify.addHook("onClose", async () => {
    await mongoose.disconnect();
    fastify.log.info("MongoDB 已断开");
  });
};

export default fp(mongoPlugin, { name: "mongo" });
