/**
 * PM2 部署配置 — 业务服务 + 日志消费进程独立托管
 *
 * 使用方式：
 *   pnpm start:all              # 启动全部
 *   pm2 start ecosystem.config.js --only q-server  # 仅业务服务
 *   pm2 logs                    # 查看日志
 */
// eslint-disable-next-line no-undef
module.exports = {
  apps: [
    {
      // ── 业务 API 服务（Fastify） ──────────────────────────
      name: "q-server",
      script: "dist/index.js",
      instances: 2, // 集群模式（按 CPU 核数）
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        LOG_ENV: "production",
        LOG_LEVEL: "info"
      },
      max_memory_restart: "512M",
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
      script: "dist/consumer/log-consumer.js",
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
    }
  ]
};
