import type { FastifyPluginAsync } from "fastify";

const routes: FastifyPluginAsync = async fastify => {
  fastify.get("/health", async () => {
    return { status: "ok" };
  });
};

export default routes;
