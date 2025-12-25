// 请求日志中间件
const requestLogger = (req, res, next) => {
  // 记录请求开始时间
  const start = Date.now();

  // 记录请求信息
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log(`请求IP: ${req.ip}`);
  console.log(`请求头:`, req.headers);

  // 只在开发环境下记录请求体（避免敏感信息泄露）
  if (process.env.NODE_ENV === "development" && req.body) {
    console.log(`请求体:`, req.body);
  }

  // 监听响应完成事件
  const originalEnd = res.end;
  res.end = function (chunk, encoding, callback) {
    // 计算响应时间
    const duration = Date.now() - start;

    // 记录响应信息
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);

    // 调用原始的end方法
    originalEnd.call(this, chunk, encoding, callback);
  };

  next();
};

export default requestLogger;
