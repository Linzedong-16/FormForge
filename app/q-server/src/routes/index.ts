import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async fastify => {
  // 健康检查
  fastify.get("/health", async (_req, reply) => {
    return reply.sendSuccess({ status: "ok", uptime: process.uptime() });
  });

  // 示例：成功与各类错误响应
  // fastify.get("/users/:id", async (req, reply) => {
  //   const user = await fastify.prisma.user.findUnique({ where: { id: +req.params.id } });
  //   if (!user) return reply.sendNotFound("用户不存在");
  //   return reply.sendSuccess(user);
  // });
};

export default routes;
