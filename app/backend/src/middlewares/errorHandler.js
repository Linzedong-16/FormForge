import multer from "multer";

// 全局错误处理中间件
const errorHandler = (err, req, res) => {
  console.error("错误详情:", err);

  // 处理Multer文件上传错误
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({
          success: false,
          message: "文件大小超过限制（最大5MB）",
          error: err.message
        });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          success: false,
          message: "文件数量超过限制",
          error: err.message
        });
      default:
        return res.status(400).json({
          success: false,
          message: "文件上传错误",
          error: err.message
        });
    }
  }

  // 处理自定义错误
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message || "请求失败",
      error: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  }

  // 处理其他错误
  res.status(500).json({
    success: false,
    message: "服务器内部错误",
    error: process.env.NODE_ENV === "development" ? err.message : "请联系管理员"
  });
};

export default errorHandler;
