/**
 * 审核模块 — 统一导出入口
 *
 * 模块组织：
 *   review.routes.ts    审核路由（列表、详情、通过、驳回）
 *   review.schemas.ts   Zod 请求/响应校验 Schema
 *   review.service.ts   业务逻辑层
 */
export { ReviewService } from "./review.service.js";
export { default as reviewRoutes } from "./review.routes.js";
export { reviewListQuerySchema, approveReviewSchema, rejectReviewSchema, reviewIdSchema } from "./review.schemas.js";
export type { ReviewListQueryInput, ApproveReviewInput, RejectReviewInput } from "./review.schemas.js";
