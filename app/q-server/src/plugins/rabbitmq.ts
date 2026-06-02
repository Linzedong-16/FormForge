import fp from "fastify-plugin";
import { connect } from "amqplib";
import type { FastifyPluginAsync } from "fastify";
import type { Connection, Channel } from "amqplib";

declare module "fastify" {
  interface FastifyInstance {
    amqp: {
      connection: Connection;
      channel: Channel;
    };
  }
}

const rabbitmqPlugin: FastifyPluginAsync = async fastify => {
  const url = process.env.RABBITMQ_URL ?? "amqp://questionnaire:questionnaire123@localhost:5672";

  const connection = await connect(url);
  const channel = await connection.createChannel();

  fastify.decorate("amqp", { connection, channel });

  fastify.addHook("onClose", async () => {
    await channel.close();
    await connection.close();
  });
};

export default fp(rabbitmqPlugin, { name: "rabbitmq" });
