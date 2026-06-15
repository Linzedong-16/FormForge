/**
 * 日志条目 Mongoose 模型
 *
 * 存储由 log-consumer 从 RabbitMQ 消费后批量写入的日志文档。
 * TTL 索引自动清理过期日志，无需手动维护。
 */
import mongoose, { Schema, type Document } from "mongoose";

// ─── 接口 ────────────────────────────────────────────────────

export interface LogEntryDocument extends Document {
  requestId?: string;
  level: string;
  message: string;
  context: Record<string, unknown>;
  timestamp: Date;
  source: string;
}

// ─── Schema ──────────────────────────────────────────────────

const LogEntrySchema = new Schema<LogEntryDocument>(
  {
    /** 全链路追踪 ID，关联同一请求的所有日志 */
    requestId: { type: String, index: true },
    /** 日志级别：trace / debug / info / warn / error / fatal */
    level: { type: String, index: true, required: true },
    /** 日志消息正文 */
    message: { type: String, required: true },
    /** 附加上下文（请求参数、响应数据、错误堆栈等） */
    context: { type: Schema.Types.Mixed, default: {} },
    /** 日志产生时间 */
    timestamp: { type: Date, default: Date.now, index: true },
    /** 服务来源，区分多实例部署 */
    source: { type: String, index: true }
  },
  {
    // 仅保留 createdAt（= timestamp），不需要 updatedAt
    timestamps: { createdAt: "timestamp", updatedAt: false }
  }
);

// ─── 索引策略 ────────────────────────────────────────────────

// 复合索引：按级别 + 时间范围查询（最常用）
LogEntrySchema.index({ level: 1, timestamp: -1 });
// 复合索引：按服务 + 时间范围查询
LogEntrySchema.index({ source: 1, timestamp: -1 });
// TTL 索引：90 天后自动删除（可通过 LOG_TTL_DAYS 环境变量调整）
const ttlDays = Number(process.env.LOG_TTL_DAYS ?? 90);
LogEntrySchema.index({ timestamp: 1 }, { expireAfterSeconds: ttlDays * 24 * 60 * 60 });

// ─── 模型导出 ────────────────────────────────────────────────

export const LogEntry = mongoose.model<LogEntryDocument>("LogEntry", LogEntrySchema);
