import express from "express";
import userRoutes from "./userRoutes.js";
import uploadRoutes from "./uploadRoutes.js";
import testRoutes from "./testRoutes.js";
import surveyRoutes from "./surveyRoutes.js";

const router = express.Router();

// 健康检查
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "服务运行正常",
    timestamp: new Date().toISOString()
  });
});

// API 文档
router.get("/api", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API 文档",
    endpoints: {
      health: "/health",
      users: "/api/users",
      upload: "/api/upload",
      survey: "/api/survey"
    }
  });
});

// 注册路由
router.use("/api/users", userRoutes);
router.use("/api/upload", uploadRoutes);
router.use("/api/test", testRoutes);
router.use("/api", surveyRoutes);

export default router;
