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

  try {
    // connect() 返回 ChannelModel（封装了底层 Connection），通过它管理连接和创建 Channel
    const connection: ChannelModel = await connect(url);
    const channel: AmqpChannel = await connection.createChannel();

    fastify.decorate("amqp", { connection, channel });

    fastify.addHook("onClose", async () => {
      try {
        await channel.close();
        await connection.close();
      } catch {
        // 连接已在关闭时断开，忽略错误
      }
    });

    fastify.log.info(`RabbitMQ 已连接 → ${url}`);
  } catch (err) {
    // RabbitMQ 不可用不应阻断业务启动（本地开发可能未启动 Docker）
    fastify.log.warn(`RabbitMQ 连接失败（日志队列将不可用）: ${(err as Error).message}`);

    // 注册一个空的 amqp 对象，避免下游代码 null 检查
    fastify.decorate("amqp", {
      get connection() {
        throw new Error("RabbitMQ 未连接");
      },
      get channel() {
        throw new Error("RabbitMQ 未连接");
      }
    } as unknown as { connection: ChannelModel; channel: AmqpChannel });
  }
};

export default fp(rabbitmqPlugin, { name: "rabbitmq" });
