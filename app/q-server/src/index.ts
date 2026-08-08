import "dotenv/config";
import { buildApp } from "./app.js";
import { startMessageScheduler } from "./modules/message/message-scheduler.js";

// P0-3: 生产环境 JWT Secret 启动前强制校验
// 在 Fastify listen() 之前执行，确保生产环境不使用默认弱密钥
// AuthService 构造函数内也有同源校验（双重保障）
const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET;
const isWeakSecret = !jwtSecret || jwtSecret === "dev-secret-change-in-production" || jwtSecret.trim() === "";

if (isProduction && isWeakSecret) {
  console.error(
    "❌ 安全错误：生产环境必须设置 JWT_SECRET 环境变量，不得使用默认值。\n" +
      "   请生成一个安全的随机字符串（如 openssl rand -hex 64）并设置到 JWT_SECRET 环境变量中。"
  );
  process.exit(1);
}

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
