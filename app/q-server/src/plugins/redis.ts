import fp from "fastify-plugin";
import fastifyRedis from "@fastify/redis";
import type { FastifyPluginAsync } from "fastify";

const redisPlugin: FastifyPluginAsync = async fastify => {
  fastify.register(fastifyRedis, {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: Number(process.env.REDIS_PORT ?? 6379),
    ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD })
  });
};

export default fp(redisPlugin, { name: "redis" });
