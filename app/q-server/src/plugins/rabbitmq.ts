import fp from "fastify-plugin";
import { connect } from "amqplib";
import type { FastifyPluginAsync } from "fastify";
import type { ChannelModel, Channel as AmqpChannel } from "amqplib";

declare module "fastify" {
  interface FastifyInstance {
    amqp: {
      connection: ChannelModel; // connect() 返回 ChannelModel，含 connection + createChannel
      channel: AmqpChannel;
    };
  }
}

const rabbitmqPlugin: FastifyPluginAsync = async fastify => {
  const url = process.env.RABBITMQ_URL ?? "amqp://questionnaire:questionnaire123@localhost:5672";

  // connect() 返回 ChannelModel（封装了底层 Connection），通过它管理连接和创建 Channel
  const connection: ChannelModel = await connect(url);
  const channel: AmqpChannel = await connection.createChannel();

  fastify.decorate("amqp", { connection, channel });

  fastify.addHook("onClose", async () => {
    await channel.close();
    await connection.close();
  });
};

export default fp(rabbitmqPlugin, { name: "rabbitmq" });
