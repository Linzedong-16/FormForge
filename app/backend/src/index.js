import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

// 导入自定义模块
import router from "./routes/index.js";
import { syncDatabase } from "./models/index.js";
import errorHandler from "./middlewares/errorHandler.js";
import requestLogger from "./middlewares/requestLogger.js";

// 加载环境变量
dotenv.config();

// 获取当前文件和目录的绝对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建Express应用
const app = express();

// 配置中间件

// CORS中间件
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

// 请求日志中间件（只在开发环境启用）
if (process.env.NODE_ENV === "development") {
  app.use(requestLogger);
}

// 请求解析中间件
app.use(bodyParser.json()); // 解析JSON请求体
app.use(bodyParser.urlencoded({ extended: true })); // 解析URL编码的请求体

// 静态文件服务
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// 注册路由
app.use("/", router);

// 404处理中间件
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "请求的资源不存在",
    path: req.url
  });
});

// 全局错误处理中间件
app.use(errorHandler);

// 获取端口
const PORT = process.env.PORT || 3000;

// 启动服务器
async function startServer() {
  try {
    // 连接数据库并同步模型
    await syncDatabase();

    // 启动服务器
    app.listen(PORT, () => {
      console.log(`\n服务器已启动在 http://localhost:${PORT}`);
      console.log(`环境: ${process.env.NODE_ENV || "development"}`);
      console.log(`API文档地址: http://localhost:${PORT}/api`);
      console.log(`健康检查: http://localhost:${PORT}/health`);
      console.log("\n按 Ctrl+C 停止服务器\n");
    });
  } catch (error) {
    console.error("启动服务器失败:", error);
    process.exit(1);
  }
}

// 启动服务器
startServer();
