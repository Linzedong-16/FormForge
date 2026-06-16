/**
 * 接口限流插件 — 基于 @fastify/rate-limit
 *
 * 策略：
 *   - 全局：100 req/min（防止恶意刷接口）
 *   - 认证接口：20 req/min（防暴力破解，由 auth 路由单独覆盖）
 *   - 生产环境：使用 Redis 共享计数器（跨多进程一致）
 *   - 开发环境：使用内存计数器（无需 Redis）
 */
import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";

const rateLimitPlugin: FastifyPluginAsync = async fastify => {
  const isProduction = process.env.NODE_ENV === "production";

  await fastify.register(rateLimit, {
    // 全局默认：100 次/分钟
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: "1 minute",

    // 生产环境用 Redis 共享计数（多进程一致），开发环境用内存
    ...(isProduction && {
      redis: fastify.redis,
      keyGenerator: req => {
        // 优先用真实 IP（反向代理后）
        return (
          (req.headers["x-real-ip"] as string) ||
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
          req.ip
        );
      }
    }),

    // 限流触发时的错误响应
    errorResponseBuilder: (_req, context) => ({
      code: 429,
      msg: `请求过于频繁，请在 ${Math.ceil(context.ttl / 60)} 分钟后重试`,
      data: null
    }),

    // 响应头中暴露限流信息
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true
    }
  });

  fastify.log.info(
    isProduction ? "限流已启用：全局 100 req/min（Redis 共享计数）" : "限流已启用：全局 100 req/min（内存计数）"
  );
};

export default fp(rateLimitPlugin, {
  name: "rate-limit",
  dependencies: ["redis"]
});
