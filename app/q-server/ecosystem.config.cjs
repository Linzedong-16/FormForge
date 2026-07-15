/**
 * PM2 部署配置 — 业务服务 + 日志消费进程独立托管
 *
 * 高并发优化：
 *   - instances: "max" 利用全部 CPU 核心
 *   - max_memory_restart: 防止内存泄漏导致 OOM
 *   - kill_timeout: 优雅关闭，等待请求处理完毕
 *
 * 使用方式：
 *   pnpm start:all              # 启动全部
 *   pm2 start ecosystem.config.cjs --only q-server  # 仅业务服务
 *   pm2 scale q-server 8        # 动态扩容到 8 实例
 *   pm2 logs                    # 查看日志
 */
// eslint-disable-next-line no-undef
module.exports = {
  apps: [
    {
      // ── 业务 API 服务（Fastify） ──────────────────────────
      name: "q-server",
      script: "dist/app/q-server/src/index.js",
      instances: "max", // 集群模式：自动取 CPU 核数
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        LOG_ENV: "production",
        LOG_LEVEL: "info",
        // 连接池：每个实例 = cpu核数 * 实例数，需留余量给 PG 最大连接数
        PRISMA_CONNECTION_LIMIT: "20",
        PRISMA_POOL_TIMEOUT: "10"
      },
      max_memory_restart: "512M",
      kill_timeout: 10000, // 优雅关闭：等待 10s 让请求处理完
      listen_timeout: 5000, // 等待端口 ready
      error_file: "./logs/q-server-error.log",
      out_file: "./logs/q-server-out.log",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000
    },
    {
      // ── 日志消费进程（独立，不集群） ──────────────────────
      name: "log-consumer",
      script: "dist/app/q-server/src/consumer/log-consumer.js",
      instances: 1, // 仅 1 实例，避免并发 ACK 冲突
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        LOG_BATCH_SIZE: "100",
        LOG_BATCH_INTERVAL_MS: "5000"
      },
      max_memory_restart: "256M",
      error_file: "./logs/log-consumer-error.log",
      out_file: "./logs/log-consumer-out.log",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000
    },
    {
      // ── 埋点消费进程（独立，不集群） ──────────────────────
      name: "tracking-consumer",
      script: "dist/app/q-server/src/consumer/tracking-consumer.js",
      instances: 1, // 仅 1 实例，保证消息顺序消费和去重
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        TRACKING_BATCH_SIZE: "200",
        TRACKING_BATCH_INTERVAL_MS: "3000",
        TRACKING_MAX_QUEUE_WARN: "50000",
        TRACKING_MAX_QUEUE_CRITICAL: "100000"
      },
      max_memory_restart: "512M",
      error_file: "./logs/tracking-consumer-error.log",
      out_file: "./logs/tracking-consumer-out.log",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000
    }
  ]
};
