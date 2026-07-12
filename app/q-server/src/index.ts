import "dotenv/config";
import { buildApp } from "./app.js";
import { startMessageScheduler } from "./modules/message/message-scheduler.js";

const app = buildApp();

try {
  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "0.0.0.0"
  });

  // 消息系统每日调度任务（消息清理 + 问卷即将过期提醒扫描），必须在 app.listen
  // 之后启动，确保 prisma/redis 等插件均已就绪
  startMessageScheduler(app);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
