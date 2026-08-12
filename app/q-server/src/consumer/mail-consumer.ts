/**
 * 邮件消费进程 — 独立于 Fastify 业务服务运行
 *
 * 流程：
 *   RabbitMQ 队列 mail:send → 逐条消费 → SMTP 发送 → 手动 ACK
 *   失败 → 重试（最多 3 次）→ 超过 3 次 → 死信队列 mail:dead
 *   SMTP 彻底不可用 → 降级写入本地文件
 *
 * 启动方式：
 *   tsx src/consumer/mail-consumer.ts            # 开发
 *   node dist/consumer/mail-consumer.js          # 生产
 *   tsx watch src/consumer/mail-consumer.ts      # 开发热重载
 *
 * 重试策略：
 *   1. 消息携带 x-retry-count 头（默认 0）
 *   2. 发送失败 → NACK 不重新入队，重新发布消息（retryCount + 1）
 *   3. retryCount >= 3 → 转发到死信队列 mail:dead，ACK 原消息
 *   4. 死信队列支持人工巡检后重新投递
 */
import "dotenv/config";
import { connect, type Channel as AmqpChannel, type ChannelModel } from "amqplib";
import nodemailer, { type Transporter } from "nodemailer";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";

// ─── 配置 ────────────────────────────────────────────────────────

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://questionnaire:questionnaire123@localhost:5672";

// 主队列 & 死信队列
const MAIL_QUEUE = process.env.MAIL_MQ_QUEUE ?? "mail:send";
const MAIL_DEAD_QUEUE = process.env.MAIL_DEAD_QUEUE ?? "mail:dead";

// 重试上限
const MAX_RETRY = Number(process.env.MAIL_MAX_RETRY ?? 3);

// SMTP 配置（由管理后台写入 systemConfig 表，consumer 通过环境变量读取）
const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.example.com";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const SMTP_FROM = process.env.SMTP_FROM ?? "noreply@formforge.com";
const SMTP_ENABLED = process.env.SMTP_ENABLED !== "false";

// 降级文件目录
const FALLBACK_DIR = process.env.MAIL_CONSUMER_FALLBACK_DIR ?? path.resolve(process.cwd(), "logs/mail-dead");

// 单次消费超时（防止 SMTP 连接 hang 住）
const SEND_TIMEOUT_MS = Number(process.env.MAIL_SEND_TIMEOUT_MS ?? 15000);

// ─── 类型定义 ────────────────────────────────────────────────────

/** 邮件消息体（与 auth.service.ts 生产者格式一致） */
interface MailMessage {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

/** 死信消息体 */
interface DeadLetterMessage {
  /** 原始邮件消息 */
  original: MailMessage;
  /** 最终失败原因 */
  error: string;
  /** 失败时间戳 */
  failedAt: string;
  /** 重试次数 */
  retryCount: number;
}

// ─── 工具函数 ────────────────────────────────────────────────────

let isShuttingDown = false;

const log = (level: "info" | "warn" | "error", msg: string, extra?: unknown) => {
  const ts = new Date().toISOString();
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    `[${ts}] [mail-consumer] [${level.toUpperCase()}] ${msg}`,
    extra ?? ""
  );
};

/** 掩码邮箱地址 */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

// ─── SMTP Transport ───────────────────────────────────────────────

let transporter: Transporter | null = null;

function createTransport(): Transporter {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP 配置不完整，请检查 SMTP_HOST / SMTP_USER / SMTP_PASS 环境变量");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: SEND_TIMEOUT_MS
  });
}

// ─── RabbitMQ 连接 ───────────────────────────────────────────────

async function connectRabbitMQ(): Promise<{ conn: ChannelModel; channel: AmqpChannel }> {
  const conn = await connect(RABBITMQ_URL);
  const channel = await conn.createChannel();

  // 声明主队列（durable，消息持久化）
  await channel.assertQueue(MAIL_QUEUE, {
    durable: true,
    arguments: {
      "x-queue-mode": "lazy"
    }
  });

  // 声明死信队列
  await channel.assertQueue(MAIL_DEAD_QUEUE, {
    durable: true,
    arguments: {
      "x-queue-mode": "lazy"
    }
  });

  // prefetch(1)：逐条消费，避免并发 SMTP 连接导致限流/封禁
  channel.prefetch(1);

  log("info", `RabbitMQ 已连接 → 主队列 [${MAIL_QUEUE}] 死信队列 [${MAIL_DEAD_QUEUE}]`);
  return { conn, channel };
}

// ─── 邮件模板渲染 ────────────────────────────────────────────────

function renderTemplate(message: MailMessage): { html: string; text: string } {
  const { template, data } = message;

  switch (template) {
    case "verification-code": {
      const code = String(data.code ?? "");
      const expiresMinutes = Number(data.expiresMinutes ?? 5);
      return {
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #333;">FormForge 验证码</h2>
            <p style="color: #666; font-size: 14px;">您的验证码如下，有效期为 ${expiresMinutes} 分钟：</p>
            <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #333;">${code}</span>
            </div>
            <p style="color: #999; font-size: 12px;">如果这不是您本人的操作，请忽略此邮件。</p>
          </div>`,
        text: `您的 FormForge 验证码为：${code}，有效期为 ${expiresMinutes} 分钟。`
      };
    }

    case "reset-password": {
      const resetLink = String(data.resetLink ?? "");
      return {
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #333;">FormForge 密码重置</h2>
            <p style="color: #666; font-size: 14px;">您已申请密码重置，请点击下方链接设置新密码：</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${resetLink}" style="background: #4f46e5; color: #fff; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-size: 14px;">重置密码</a>
            </div>
            <p style="color: #999; font-size: 12px;">链接有效期为 30 分钟。如果这不是您本人的操作，请忽略此邮件。</p>
          </div>`,
        text: `您已申请密码重置，请点击以下链接设置新密码：${resetLink}`
      };
    }

    case "welcome": {
      const username = String(data.username ?? "");
      return {
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #333;">欢迎加入 FormForge</h2>
            <p style="color: #666; font-size: 14px;">${username}，您好！</p>
            <p style="color: #666; font-size: 14px;">感谢您注册 FormForge，我们提供强大的低代码表单构建能力，助您高效收集和管理数据。</p>
          </div>`,
        text: `欢迎加入 FormForge，${username}！感谢您的注册。`
      };
    }

    default:
      // 未知模板类型 → 使用纯文本降级，保留原始数据
      log("warn", `未知邮件模板: ${template}，使用纯文本降级渲染`);
      return {
        html: `<pre style="font-family: monospace;">${JSON.stringify(data, null, 2)}</pre>`,
        text: JSON.stringify(data, null, 2)
      };
  }
}

// ─── 发送邮件 ────────────────────────────────────────────────────

async function sendMail(message: MailMessage): Promise<void> {
  if (!SMTP_ENABLED) {
    throw new Error("SMTP 服务已禁用");
  }

  if (!transporter) {
    transporter = createTransport();
  }

  const { html, text } = renderTemplate(message);

  const result = await Promise.race([
    transporter.sendMail({
      from: SMTP_FROM,
      to: message.to,
      subject: message.subject,
      html,
      text
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`邮件发送超时（${SEND_TIMEOUT_MS}ms）`)), SEND_TIMEOUT_MS)
    )
  ]);

  log("info", `邮件发送成功 → ${maskEmail(message.to)} [${message.template}]`, {
    messageId: result.messageId
  });
}

// ─── 降级写入本地文件 ────────────────────────────────────────────

let fallbackStream: ReturnType<typeof createWriteStream> | null = null;

function writeFallback(message: MailMessage, error: string): void {
  if (!fallbackStream) {
    mkdirSync(FALLBACK_DIR, { recursive: true });
    const filename = `mail-dead-${new Date().toISOString().slice(0, 10)}.jsonl`;
    fallbackStream = createWriteStream(path.join(FALLBACK_DIR, filename), { flags: "a" });
  }

  fallbackStream.write(
    JSON.stringify({
      original: message,
      error,
      failedAt: new Date().toISOString(),
      retryCount: MAX_RETRY
    } satisfies DeadLetterMessage) + "\n"
  );

  log("warn", `降级写入本地文件: ${maskEmail(message.to)}`);
}

// ─── 发布到死信队列 ──────────────────────────────────────────────

async function publishToDeadLetter(
  channel: AmqpChannel,
  message: MailMessage,
  error: string,
  retryCount: number
): Promise<void> {
  const deadMsg: DeadLetterMessage = {
    original: message,
    error,
    failedAt: new Date().toISOString(),
    retryCount
  };

  channel.sendToQueue(MAIL_DEAD_QUEUE, Buffer.from(JSON.stringify(deadMsg)), {
    persistent: true
  });

  log("error", `消息转入死信队列 → ${maskEmail(message.to)} [重试${retryCount}次后仍失败]`, {
    error: error.slice(0, 200)
  });
}

// ─── 主消费循环 ──────────────────────────────────────────────────

async function consumeLoop(channel: AmqpChannel): Promise<void> {
  let consecutiveSendFailures = 0;

  while (!isShuttingDown) {
    try {
      // 非阻塞拉取一条消息（prefetch(1) 已限制并发）
      const msg = await Promise.race([
        channel.get(MAIL_QUEUE, { noAck: false }),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 2000))
      ]);

      if (!msg) {
        continue;
      }

      let mailMessage: MailMessage;
      try {
        mailMessage = JSON.parse(msg.content.toString());
      } catch {
        // JSON 解析失败 → 坏消息，直接 ACK 不阻塞队列
        log("warn", "消息解析失败，已丢弃");
        channel.ack(msg);
        continue;
      }

      // 读取重试计数
      const retryCount = Number(msg.properties.headers?.["x-retry-count"] ?? 0);

      try {
        await sendMail(mailMessage);

        // 发送成功 → ACK
        channel.ack(msg);
        consecutiveSendFailures = 0;
        log("info", `消费成功 → ${maskEmail(mailMessage.to)} [重试${retryCount}次]`);
      } catch (err) {
        const errorMsg = (err as Error).message;
        log("error", `邮件发送失败（第${retryCount + 1}次）→ ${maskEmail(mailMessage.to)}: ${errorMsg}`);

        consecutiveSendFailures++;

        if (retryCount >= MAX_RETRY) {
          // 超过重试上限 → 先尝试发布到死信队列，失败则降级写入本地文件
          try {
            await publishToDeadLetter(channel, mailMessage, errorMsg, retryCount);
          } catch {
            log("error", "死信队列发布失败，降级写入本地文件");
            writeFallback(mailMessage, errorMsg);
          }

          // ACK 原消息（已处理完毕）
          channel.ack(msg);
        } else {
          // 未达到重试上限 → 重新发布消息（递增重试计数），ACK 原消息
          const newHeaders = { ...(msg.properties.headers ?? {}), "x-retry-count": retryCount + 1 };

          channel.sendToQueue(MAIL_QUEUE, msg.content, {
            persistent: true,
            headers: newHeaders
          });
          channel.ack(msg);

          // 递增退避延迟：1s → 2s → 4s
          const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 10000);
          await new Promise(r => setTimeout(r, backoffMs));
        }

        // 连续 5 次发送失败 → 可能 SMTP 服务故障，发出告警
        if (consecutiveSendFailures >= 5) {
          log("error", `[P1 告警] SMTP 连续 ${consecutiveSendFailures} 次发送失败，请检查邮件服务！`);
        }
      }
    } catch (err) {
      log("error", `消费循环异常: ${(err as Error).message}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// ─── 启动入口 ────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("info", "邮件消费进程启动中...");
  log(
    "info",
    `配置: queue=${MAIL_QUEUE}, dead=${MAIL_DEAD_QUEUE}, max_retry=${MAX_RETRY}, smtp=${SMTP_HOST}:${SMTP_PORT}`
  );

  // 验证 SMTP 配置
  if (!SMTP_ENABLED) {
    log("warn", "SMTP 已禁用，消费者将拒绝所有消息（消息将全部进入重试/死信队列）");
  } else {
    log("info", `SMTP 发件人: ${SMTP_FROM}`);
  }

  // 连接 RabbitMQ
  let conn: ChannelModel;
  let channel: AmqpChannel;
  try {
    ({ conn, channel } = await connectRabbitMQ());
  } catch (err) {
    log("error", `RabbitMQ 连接失败: ${(err as Error).message}`);
    process.exit(1);
  }

  // 优雅关闭
  const shutdown = async (signal: string) => {
    log("info", `收到 ${signal}，开始优雅关闭...`);
    isShuttingDown = true;

    // 等待当前正在处理的邮件发送完成
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 关闭 SMTP 连接池
    if (transporter) {
      try {
        transporter.close();
      } catch {
        // 忽略关闭异常
      }
    }

    try {
      await channel.close();
      await conn.close();
    } catch {
      // 忽略关闭异常
    }

    log("info", "邮件消费进程已关闭");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // 启动消费循环
  await consumeLoop(channel);
}

main().catch(err => {
  log("error", `启动失败: ${err.message}`);
  process.exit(1);
});
