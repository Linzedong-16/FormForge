/**
 * Redis 连接插件 — 基于 ioredis 直连
 *
 * 设计思路：
 *   - 不依赖 @fastify/redis（其 v7.2.0 在 Redis 不可用时存在 onEnd 中
 *     client.quit() 抛出未处理 Promise 拒绝的 Bug，可能导致进程崩溃）
 *   - 使用 ioredis 直连，完全控制连接生命周期
 *   - 连接失败时优雅降级，不阻塞服务启动
 *   - 自动重连（生产环境），开发环境快速失败
 */
import fp from "fastify-plugin";
import { Redis } from "ioredis";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync = async fastify => {
  const host = process.env.REDIS_HOST ?? "127.0.0.1";
  const port = Number(process.env.REDIS_PORT ?? 6379);
  const password = process.env.REDIS_PASSWORD;
  const connectTimeout = Number(process.env.REDIS_CONNECT_TIMEOUT ?? 5000);
  const commandTimeout = Number(process.env.REDIS_COMMAND_TIMEOUT ?? 3000);
  const isProduction = process.env.NODE_ENV === "production";

  const client = new Redis({
    host,
    port,
    ...(password && { password }),
    // 连接超时 — 避免 Redis 不可用时 TCP 连接永久挂起
    connectTimeout,
    // 命令执行超时 — 防止 Redis 阻塞时请求卡死
    commandTimeout,
    // 失败后重试连接（生产环境启用，开发环境禁用以免干扰调试）
    retryStrategy(times) {
      if (!isProduction && times > 0) {
        // 开发环境：不重试，立即失败
        return null;
      }
      if (times > 3) {
        fastify.log.error("Redis 重试次数已达上限，放弃连接");
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    // 连接断开时选择性重连
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
      return targetErrors.some(e => err.message.includes(e));
    },
    // 最大重试次数（单次请求）
    maxRetriesPerRequest: 3,
    // 启用就绪检查（确保 INFO 命令成功后才标记 ready）
    enableReadyCheck: true,
    // 不启用离线队列（Redis 不可用时命令直接失败，不排队）
    enableOfflineQueue: true,
    // 连接断开后等待重连的最大时间
    maxLoadingRetryTime: 5000,
    // lazyConnect + 手动 connect，避免构造函数抛错
    lazyConnect: true
  });

  // ── 事件监听 ──────────────────────────────────────────────
  client.on("connect", () => {
    fastify.log.info(`Redis 正在连接 ${host}:${port}...`);
  });

  client.on("ready", () => {
    fastify.log.info("Redis 连接就绪");
  });

  client.on("error", (err: Error) => {
    fastify.log.error({ err }, "Redis 连接错误");
  });

  client.on("close", () => {
    fastify.log.warn("Redis 连接已关闭");
  });

  client.on("reconnecting", (ms: number) => {
    fastify.log.warn(`Redis 将在 ${ms}ms 后重连`);
  });

  // ── 手动连接 ──────────────────────────────────────────────
  try {
    await client.connect();
    fastify.log.info("Redis 连接成功");
  } catch (err) {
    fastify.log.warn(`Redis 连接失败（缓存将不可用）: ${(err as Error).message}`);
    // 不抛出异常，让服务继续启动
  }

  // ── 装饰 fastify 实例 ────────────────────────────────────
  fastify.decorate("redis", client);

  // ── 优雅关闭 ──────────────────────────────────────────────
  fastify.addHook("onClose", async () => {
    fastify.log.info("正在关闭 Redis 连接...");
    try {
      await client.quit();
    } catch {
      // 连接可能已断开，忽略错误
      client.disconnect();
    }
  });
};

export default fp(redisPlugin, { name: "redis" });
