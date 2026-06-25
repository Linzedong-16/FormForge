import type { FastifyPluginAsync } from "fastify";
import authRoutes from "../modules/user/auth/auth.routes.js";
import adminRoutes from "../modules/user/admin/admin.routes.js";
import userCrudRoutes from "../modules/user/user-crud/user-crud.routes.js";
import profileRoutes from "../modules/user/profile/profile.routes.js";
import surveyCrudRoutes from "../modules/survey/survey-crud/survey-crud.routes.js";
import fileRoutes from "../modules/survey/file/file.routes.js";
import uploadRoutes from "../modules/survey/upload/upload.routes.js";
import aiGenerateRoutes from "../modules/ai/ai-generate/ai-generate.routes.js";
import aiPolishRoutes from "../modules/ai/ai-polish/ai-polish.routes.js";
import aiConfigRoutes from "../modules/ai/ai-config/ai-config.routes.js";
import logRoutes from "../modules/log/log.routes.js";
import reviewRoutes from "../modules/review/review.routes.js";
import templateRoutes from "../modules/template/template.routes.js";

const routes: FastifyPluginAsync = async fastify => {
  // 健康检查 — 探测 PostgreSQL、Redis、RabbitMQ 连通性
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

  /// 统一配置 modules 路由
  fastify.register(authRoutes, { prefix: "/auth" });
  fastify.register(adminRoutes, { prefix: "/admin" });
  fastify.register(userCrudRoutes, { prefix: "/user" });
  fastify.register(profileRoutes, { prefix: "/user" });
  fastify.register(uploadRoutes, { prefix: "/q-editor" });
  // survey-crud.routes.ts 内部路径已为 /surveys、/responses 等完整路径，无需额外前缀
  fastify.register(surveyCrudRoutes);
  // file.routes.ts 内部路径为 /surveys/:id/files、/survey-files/:id
  fastify.register(fileRoutes);
  // ai-generate.routes.ts 内部路径为 /surveys/generate（SSE 流式）
  fastify.register(aiGenerateRoutes);
  // ai-polish.routes.ts 内部路径为 /surveys/polish（SSE 流式）
  fastify.register(aiPolishRoutes);
  // ai-config.routes.ts 内部路径为 /config/ai（管理员 AI 配置管理）
  fastify.register(aiConfigRoutes, { prefix: "/admin" });
  // log.routes.ts 内部路径为 /logs、/logs/stats（管理员日志查询）
  fastify.register(logRoutes);
  // review.routes.ts 内部路径为 /reviews（管理员审核管理）
  fastify.register(reviewRoutes, { prefix: "/admin" });
  // template.routes.ts 内部路径为 /templates（模板市场）
  fastify.register(templateRoutes);
};

export default routes;
