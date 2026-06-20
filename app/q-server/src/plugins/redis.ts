import fp from "fastify-plugin";
import fastifyRedis from "@fastify/redis";
import type { FastifyPluginAsync } from "fastify";

const redisPlugin: FastifyPluginAsync = async fastify => {
  fastify.register(fastifyRedis, {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: Number(process.env.REDIS_PORT ?? 6379),
    ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
    // 连接超时 — 避免 Redis 不可用时 TCP 连接永久挂起
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT ?? 5000),
    // 命令执行超时 — 防止 Redis 阻塞时请求卡死
    commandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT ?? 3000),
    // 重试策略：最多重试 3 次，每次间隔递增，超时后快速失败
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) {
        fastify.log.error("Redis 重试次数已达上限，放弃连接");
        return null; // 停止重试
      }
      return Math.min(times * 200, 2000);
    },
    // 连接断开时自动重连
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
      if (targetErrors.some(e => err.message.includes(e))) {
        return true;
      }
      return false;
    },
    // 懒连接：首次使用时才连接，避免启动时 Redis 不可用导致进程崩溃
    lazyConnect: true,
    // 连接就绪后记录日志
    enableReadyCheck: true
  });

  // 连接就绪后记录日志
  fastify.redis.on("ready", () => {
    fastify.log.info("Redis 连接就绪");
  });
  fastify.redis.on("error", (err: Error) => {
    fastify.log.error({ err }, "Redis 连接错误");
  });
};

export default fp(redisPlugin, { name: "redis" });
