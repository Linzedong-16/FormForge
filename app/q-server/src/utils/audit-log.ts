/**
 * 审计日志工具 — 供各 Service 复用的写审计日志方法
 *
 * 设计原则：
 *   - 审计日志写入失败不阻塞业务（仅 warn 日志）
 *   - DB 写入失败时降级到本地文件，确保审计记录不丢失
 *   - 统一的日志捕获和错误处理
 */

import { appendFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { InputJsonValue } from "@prisma/client/runtime/client";

// ─── 降级文件配置 ──────────────────────────────────────────

/** 审计日志降级文件路径（项目根目录） */
const FALLBACK_FILE = path.resolve(process.cwd(), "logs", "audit-fallback.log");

/**
 * 降级写入本地审计文件（fire-and-forget）
 */
function appendToFallbackFile(entry: string) {
  appendFile(FALLBACK_FILE, entry + "\n").catch(() => {
    // 文件写入也失败时不再处理，避免无限递归
  });
}

/**
 * 写入一条审计日志
 *
 * @param fastify     Fastify 实例
 * @param userId      操作者用户 ID（未登录用户传 null）
 * @param action      操作类型（如 "login", "create_user", "update_smtp_config"）
 * @param resourceType 资源类型（如 "user", "system_config"）
 * @param resourceId  资源 ID（可为 null）
 * @param details     操作详情（可选）
 */
export async function createAuditLog(
  fastify: FastifyInstance,
  userId: bigint | null,
  action: string,
  resourceType: string,
  resourceId: bigint | null,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await fastify.prisma.auditLog.create({
      data: {
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: details as InputJsonValue
      }
    });
  } catch {
    fastify.log.warn(`审计日志写入失败，降级到文件: ${action}`);
    // 降级写入本地审计文件，后续可通过 log-consumer 异步补录
    const fallbackEntry = JSON.stringify({
      user_id: userId !== null ? String(userId) : null,
      action,
      resource_type: resourceType,
      resource_id: resourceId !== null ? String(resourceId) : null,
      details,
      timestamp: new Date().toISOString()
    });
    appendToFallbackFile(fallbackEntry);
  }
}
