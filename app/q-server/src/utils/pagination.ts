/**
 * 分页工具 — 查询参数校验 & 安全限制
 *
 * 防止：
 *   1. 超大 pageSize 拖垮数据库（限制最大 100）
 *   2. 负数/零值 page 参数
 */
import { z } from "zod";

// ─── 分页参数 Schema ─────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10)
});

export type PaginationParams = z.infer<typeof paginationSchema>;

// ─── 分页结果 ────────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── 分页辅助函数 ────────────────────────────────────────────

/**
 * 构建 Prisma 分页参数
 */
export function buildPagination(params: PaginationParams) {
  return {
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize
  };
}

/**
 * 包装分页结果
 */
export function paginatedResult<T>(items: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  return {
    items,
    total,
    page: params.page,
    limit: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize)
  };
}

/**
 * 从 query 安全解析分页参数（路由层用）
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const result = paginationSchema.safeParse(query);
  return result.success ? result.data : { page: 1, pageSize: 10 };
}
