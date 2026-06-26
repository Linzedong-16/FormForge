/**
 * DeepSeek 用量查询 — Zod Schema
 */
import { z } from "zod";

/** GET /api/admin/ai/usage — 查询参数 */
export const usageQuerySchema = z.object({
  /** 起始日期 YYYY-MM-DD，默认 30 天前 */
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD")
    .optional(),
  /** 截止日期 YYYY-MM-DD，默认今天 */
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD")
    .optional()
});

export type UsageQueryInput = z.infer<typeof usageQuerySchema>;
