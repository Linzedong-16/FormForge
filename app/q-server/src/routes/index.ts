import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async fastify => {
  // 健康检查 — 探测 PostgreSQL、RabbitMQ 连通性
  fastify.get("/health", async (_req, reply) => {
    const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};

    // ── PostgreSQL（Prisma）检查 ──────────────────────────────
    try {
      const t0 = Date.now();
      await fastify.prisma.$queryRawUnsafe("SELECT 1");
      checks.postgres = { ok: true, latency_ms: Date.now() - t0 };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      checks.postgres = { ok: false, error: message };
    }

    // ── Redis 检查 ───────────────────────────────────────────
    if (fastify.redis) {
      try {
        const t0 = Date.now();
        const pong = await fastify.redis.ping();
        checks.redis = { ok: pong === "PONG", latency_ms: Date.now() - t0 };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        checks.redis = { ok: false, error: message };
      }
    } else {
      checks.redis = { ok: false, error: "Redis 插件未注册" };
    }

    // ── RabbitMQ 检查 ─────────────────────────────────────────
    if (fastify.amqp) {
      try {
        const t0 = Date.now();
        // 尝试声明一个临时独占队列来验证 channel 连通性
        const q = await fastify.amqp.channel.assertQueue("", { exclusive: true });
        await fastify.amqp.channel.deleteQueue(q.queue);
        checks.rabbitmq = { ok: true, latency_ms: Date.now() - t0 };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        checks.rabbitmq = { ok: false, error: message };
      }
    } else {
      checks.rabbitmq = { ok: false, error: "RabbitMQ 插件未注册" };
    }

    // ── 汇总 ──────────────────────────────────────────────────
    const allOk = Object.values(checks).every(c => c.ok);
    const status = allOk ? "ok" : "degraded";

    return reply.sendSuccess(
      {
        status,
        uptime: process.uptime(),
        checks
      },
      allOk ? "ok" : "部分服务异常",
      allOk ? 0 : 500
    );
  });

  // 示例：成功与各类错误响应
  // fastify.get("/users/:id", async (req, reply) => {
  //   const user = await fastify.prisma.user.findUnique({ where: { id: +req.params.id } });
  //   if (!user) return reply.sendNotFound("用户不存在");
  //   return reply.sendSuccess(user);
  // });
};

export default routes;
