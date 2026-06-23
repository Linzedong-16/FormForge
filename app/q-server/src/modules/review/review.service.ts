/**
 * 审核模块 — 业务逻辑层
 *
 * 职责：
 *   - 审核列表查询（分页 + 按状态筛选）
 *   - 审核详情查询（含问卷完整题目内容）
 *   - 审核通过（事务更新 Review + Survey）
 *   - 审核驳回（事务更新 Review + Survey）
 *   - 审计日志写入
 */

import type { FastifyInstance } from "fastify";
import { createAuditLog } from "../../utils/audit-log.js";
import { AppError } from "../../utils/errors.js";
import type { ReviewListQueryInput, ApproveReviewInput, RejectReviewInput } from "./review.schemas.js";
import type {
  ReviewListItem,
  ReviewDetail,
  ReviewListResponse,
  ReviewActionResponse,
  ReviewType
} from "@common/review/review.interface.js";

// ─── 工具函数 ──────────────────────────────────────────────────

function bigIntToStr(value: bigint): string {
  return String(value);
}

/** 将 Prisma Review 行转为 ReviewListItem */
function toReviewListItem(row: Record<string, unknown>): ReviewListItem {
  const survey = row.survey as Record<string, unknown>;
  const submitter = row.submitter as Record<string, unknown>;
  return {
    review_id: bigIntToStr(row.id as bigint),
    survey_id: bigIntToStr(row.survey_id as bigint),
    survey_title: survey.title as string,
    survey_type: survey.survey_type as ReviewListItem["survey_type"],
    category: (survey.category as string) ?? null,
    submitter_name: submitter.username as string,
    review_type: row.review_type as ReviewType,
    status: row.status as ReviewListItem["status"],
    submit_message: (row.submit_message as string) ?? null,
    submitted_at: (row.submitted_at as Date).toISOString()
  };
}

// ─── Service 类 ────────────────────────────────────────────────

export class ReviewService {
  constructor(private readonly fastify: FastifyInstance) {}

  // ============================================================
  //  审核列表查询
  // ============================================================

  /**
   * 分页查询审核列表
   *
   * 查询逻辑：
   *   1. 按 status 筛选 Review 记录
   *   2. 关联查询 surveys 表和 users 表
   *   3. 按 submitted_at 降序排列（最新提交在前）
   */
  async listReviews(query: ReviewListQueryInput): Promise<ReviewListResponse> {
    const { review_type, status, page, page_size, survey_type } = query;

    this.fastify.log.info({ query: { review_type, status, page, page_size, survey_type } }, "[review] 查询审核列表");

    // ── status = "none"：查询 surveys 表中尚未提交审核的问卷 ──
    if (status === "none") {
      return this.listUnreviewedSurveys(review_type, page, page_size, survey_type);
    }

    // ── 常规审核记录查询（reviews 表）──
    const where: Record<string, unknown> = { review_type, status };
    if (survey_type) {
      where.survey = { survey_type };
    }

    const [records, total] = await Promise.all([
      this.fastify.prisma.review.findMany({
        where,
        include: {
          survey: {
            select: { title: true, survey_type: true, category: true }
          },
          submitter: {
            select: { username: true }
          }
        },
        orderBy: { submitted_at: "desc" },
        skip: (page - 1) * page_size,
        take: page_size
      }),
      this.fastify.prisma.review.count({ where })
    ]);

    this.fastify.log.info({ total, returned: records.length }, "[review] 审核列表查询完成");

    return {
      list: records.map(r => toReviewListItem(r as unknown as Record<string, unknown>)),
      pagination: {
        page,
        page_size,
        total,
        total_pages: Math.ceil(total / page_size)
      }
    };
  }

  /**
   * 查询未审核问卷列表（surveys 表 review_status = "none"）
   *
   * 使用 Prisma 关系过滤 `reviews: { none: {...} }` 生成 NOT EXISTS 子查询，
   * 避免 notIn 大数组导致的 SQL 参数超限，同时消除两次查询间的 TOCTOU 竞态。
   */
  private async listUnreviewedSurveys(
    review_type: string,
    page: number,
    page_size: number,
    survey_type?: "personal" | "template" | undefined
  ): Promise<ReviewListResponse> {
    // 通过 reviews 关系过滤：排除已有同类型 pending 审核记录的问卷
    // Prisma 将 `none` 编译为 NOT EXISTS 子查询，无参数数量限制且单次查询原子性
    const where: Record<string, unknown> = {
      deleted_at: null,
      review_status: "none",
      reviews: {
        none: {
          review_type: review_type as ReviewType,
          status: "pending"
        }
      }
    };
    if (survey_type) {
      where.survey_type = survey_type;
    }

    const [surveys, total] = await Promise.all([
      this.fastify.prisma.survey.findMany({
        where,
        select: {
          id: true,
          title: true,
          survey_type: true,
          category: true,
          user_id: true,
          user: { select: { username: true } },
          created_at: true
        },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * page_size,
        take: page_size
      }),
      this.fastify.prisma.survey.count({ where })
    ]);

    this.fastify.log.info({ total, returned: surveys.length }, "[review] 未审核问卷查询完成");

    const list: ReviewListItem[] = surveys.map(s => ({
      review_id: "",
      survey_id: bigIntToStr(s.id),
      survey_title: s.title,
      survey_type: s.survey_type as ReviewListItem["survey_type"],
      category: s.category ?? null,
      submitter_name: s.user.username,
      review_type: review_type as ReviewType,
      status: "none" as ReviewListItem["status"],
      submit_message: null,
      submitted_at: s.created_at.toISOString()
    }));

    return {
      list,
      pagination: {
        page,
        page_size,
        total,
        total_pages: Math.ceil(total / page_size)
      }
    };
  }

  // ============================================================
  //  审核详情查询
  // ============================================================

  /**
   * 获取审核详情（含问卷完整题目内容）
   *
   * 查询逻辑：
   *   1. 查询 Review 记录，关联 survey、submitter、reviewer
   *   2. 关联查询 survey_components，按 order_index 排序
   */
  async getReviewDetail(reviewId: bigint): Promise<ReviewDetail> {
    this.fastify.log.info({ reviewId: bigIntToStr(reviewId) }, "[review] 查询审核详情");

    const review = await this.fastify.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        survey: {
          include: {
            components: {
              orderBy: { order_index: "asc" }
            }
          }
        },
        submitter: { select: { id: true, username: true } },
        reviewer: { select: { id: true, username: true } }
      }
    });

    if (!review) {
      this.fastify.log.warn({ reviewId: bigIntToStr(reviewId) }, "[review] 审核记录不存在");
      throw new AppError("审核记录不存在", 404);
    }

    const survey = review.survey;
    const result: ReviewDetail = {
      review_id: bigIntToStr(review.id),
      survey_id: bigIntToStr(review.survey_id),
      survey_title: survey.title,
      survey_description: survey.description,
      survey_type: survey.survey_type,
      category: survey.category,
      submitter_id: bigIntToStr(review.submitter_id),
      submitter_name: review.submitter.username,
      review_type: review.review_type as ReviewType,
      status: review.status,
      submit_message: review.submit_message,
      review_comment: review.review_comment,
      reviewer_id: review.reviewer_id ? bigIntToStr(review.reviewer_id) : null,
      reviewer_name: review.reviewer?.username ?? null,
      submitted_at: review.submitted_at.toISOString(),
      reviewed_at: review.reviewed_at?.toISOString() ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components: survey.components.map((c: any) => ({
        id: bigIntToStr(c.id),
        type: c.type,
        config: c.config as Record<string, unknown>,
        order_index: c.order_index,
        required: c.required as 0 | 1
      }))
    };

    this.fastify.log.info(
      { reviewId: bigIntToStr(reviewId), componentCount: result.components.length },
      "[review] 审核详情查询完成"
    );

    return result;
  }

  // ============================================================
  //  审核通过
  // ============================================================

  /**
   * 审核通过
   *
   * 事务操作：
   *   1. 校验 Review 状态是否为 pending（防止重复审核）
   *   2. 更新 Review：status → approved, reviewer_id, reviewed_at, review_comment
   *   3. 按 review_type 区分处理：
   *      - survey：更新 Survey.review_status → approved（问卷审核通过，可发布）
   *      - template：更新 Survey.survey_type → template（模板审核通过，上架模板市场）
   *   4. 写入审计日志（fire-and-forget）
   */
  async approveReview(adminId: bigint, reviewId: bigint, input: ApproveReviewInput): Promise<ReviewActionResponse> {
    this.fastify.log.info({ adminId: bigIntToStr(adminId), reviewId: bigIntToStr(reviewId) }, "[review] 审核通过请求");

    const review = await this.fastify.prisma.$transaction(async tx => {
      const existing = await tx.review.findUnique({ where: { id: reviewId } });
      if (!existing) {
        throw new AppError("审核记录不存在", 404);
      }
      if (existing.status !== "pending") {
        throw new AppError("该审核记录已处理，无法重复操作", 409);
      }

      const now = new Date();

      const updated = await tx.review.update({
        where: { id: reviewId },
        data: {
          status: "approved",
          reviewer_id: adminId,
          review_comment: input.review_comment ?? null,
          reviewed_at: now
        }
      });

      // 按审核类型区分处理 Survey 状态
      if (existing.review_type === "template") {
        // 模板审核通过：将问卷标记为公共模板
        await tx.survey.update({
          where: { id: existing.survey_id },
          data: { survey_type: "template" }
        });
      } else {
        // 问卷审核通过：标记为已通过（允许发布）
        await tx.survey.update({
          where: { id: existing.survey_id },
          data: { review_status: "approved" }
        });
      }

      return updated;
    });

    // 异步写入审计日志
    createAuditLog(this.fastify, adminId, "approve_review", "review", reviewId, {
      survey_id: bigIntToStr(review.survey_id),
      comment: input.review_comment
    }).catch(() => {});

    this.fastify.log.info({ reviewId: bigIntToStr(reviewId), status: "approved" }, "[review] 审核通过完成");

    return {
      review_id: bigIntToStr(review.id),
      status: review.status,
      reviewed_at: review.reviewed_at!.toISOString()
    };
  }

  // ============================================================
  //  审核驳回
  // ============================================================

  /**
   * 审核驳回
   *
   * 与审核通过逻辑相同，但 review_comment 为必填项。
   * 按 review_type 区分：
   *   - survey：Survey.review_status → rejected，驳回后用户可修改问卷后重新提交
   *   - template：仅更新 Review 记录，不改变问卷状态（问卷审核已通过保持不变）
   */
  async rejectReview(adminId: bigint, reviewId: bigint, input: RejectReviewInput): Promise<ReviewActionResponse> {
    this.fastify.log.info({ adminId: bigIntToStr(adminId), reviewId: bigIntToStr(reviewId) }, "[review] 审核驳回请求");

    const review = await this.fastify.prisma.$transaction(async tx => {
      const existing = await tx.review.findUnique({ where: { id: reviewId } });
      if (!existing) {
        throw new AppError("审核记录不存在", 404);
      }
      if (existing.status !== "pending") {
        throw new AppError("该审核记录已处理，无法重复操作", 409);
      }

      const now = new Date();

      const updated = await tx.review.update({
        where: { id: reviewId },
        data: {
          status: "rejected",
          reviewer_id: adminId,
          review_comment: input.review_comment,
          reviewed_at: now
        }
      });

      // 按审核类型区分处理 Survey 状态
      if (existing.review_type === "template") {
        // 模板审核驳回：不改变问卷状态（问卷审核已通过保持不变）
        // 用户修改问卷后会重置 review_status，之后需要重新走问卷审核 → 模板审核流程
      } else {
        // 问卷审核驳回：标记为已驳回
        await tx.survey.update({
          where: { id: existing.survey_id },
          data: { review_status: "rejected" }
        });
      }

      return updated;
    });

    // 异步写入审计日志
    createAuditLog(this.fastify, adminId, "reject_review", "review", reviewId, {
      survey_id: bigIntToStr(review.survey_id),
      comment: input.review_comment
    }).catch(() => {});

    this.fastify.log.info({ reviewId: bigIntToStr(reviewId), status: "rejected" }, "[review] 审核驳回完成");

    return {
      review_id: bigIntToStr(review.id),
      status: review.status,
      reviewed_at: review.reviewed_at!.toISOString()
    };
  }
}
