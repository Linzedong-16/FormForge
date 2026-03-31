import express from "express";
import qEditorRoutes from "./test/qEditorRoutes.js";

const router = express.Router();

// 获取用户列表
router.get("/test/users", (req, res) => {
  const users = [
    { id: 1, name: "张三", email: "zhangsan@example.com", age: 25, role: "admin" },
    { id: 2, name: "李四", email: "lisi@example.com", age: 30, role: "user" },
    { id: 3, name: "王五", email: "wangwu@example.com", age: 28, role: "user" },
    { id: 4, name: "赵六", email: "zhaoliu@example.com", age: 35, role: "admin" },
    { id: 5, name: "孙七", email: "sunqi@example.com", age: 22, role: "user" }
  ];

  // 返回统一格式的响应数据
  res.json({
    code: 200,
    message: "获取用户列表成功",
    data: users
  });
});

// 获取系统信息
router.get("/test/system/info", (req, res) => {
  const systemInfo = {
    name: "测试系统",
    version: "1.0.0",
    description: "前后端分离测试系统",
    uptime: process.uptime().toFixed(0),
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  };

  // 返回统一格式的响应数据
  res.json({
    code: 200,
    message: "获取系统信息成功",
    data: systemInfo
  });
});

// 获取随机数据
router.get("/test/random", (req, res) => {
  const randomData = {
    number: Math.floor(Math.random() * 1000),
    string: Math.random().toString(36).substring(2, 15),
    timestamp: Date.now(),
    boolean: Math.random() > 0.5,
    randomArray: [Math.floor(Math.random() * 100), Math.floor(Math.random() * 100), Math.floor(Math.random() * 100)]
  };

  // 返回统一格式的响应数据
  res.json({
    code: 200,
    message: "获取随机数据成功",
    data: randomData
  });
});

// q-editor测试路由
router.use("/q-editor", qEditorRoutes);

export default router;
