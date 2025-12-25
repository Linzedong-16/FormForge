import express from "express";
import userRoutes from "./userRoutes.js";
import uploadRoutes from "./uploadRoutes.js";
import testRoutes from "./testRoutes.js";

const router = express.Router();

// 注册子路由
router.use("/api", userRoutes);
router.use("/api", uploadRoutes);
router.use("/api", testRoutes);

// 健康检查路由
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "服务器运行正常",
    timestamp: new Date().toISOString()
  });
});

export default router;
