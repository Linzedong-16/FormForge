/**
 * 审计日志工具 — 供各 Service 复用的写审计日志方法
 *
 * 设计原则：
 *   - 审计日志写入失败不阻塞业务（仅 warn 日志）
 *   - 统一的日志捕获和错误处理
 */

import type { FastifyInstance } from "fastify";

/**
 * 写入一条审计日志
 *
 * @param fastify     Fastify 实例
 * @param userId      操作者用户 ID
 * @param action      操作类型（如 "login", "create_user", "update_smtp_config"）
 * @param resourceType 资源类型（如 "user", "system_config"）
 * @param resourceId  资源 ID（可为 null）
 * @param details     操作详情（可选）
 */
export async function createAuditLog(
  fastify: FastifyInstance,
  userId: bigint,
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
        details: details as unknown as import("@prisma/client/runtime/library").InputJsonValue
      }
    });
  } catch {
    fastify.log.warn(`审计日志写入失败: ${action}`);
  }
}
