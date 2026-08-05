/**
 * 审核模块 — 业务逻辑层
 *
 * 职责：
 *   - 审核列表查询（分页 + 按状态筛选）
 *   - 审核详情查询（含问卷/模板完整题目内容）
 *   - 审核通过（事务更新 Review + Survey / Template）
 *   - 审核驳回（事务更新 Review + Survey）
 *   - 审计日志写入
 *
 * 方案B适配：
 *   - 模板审核通过后，在 templates 表创建独立记录（深拷贝问卷数据）
 *   - 问卷审核流程不变（仅更新 review_status）
 */

import type { FastifyInstance } from "fastify";
import { createAuditLog } from "../../utils/audit-log.js";
import { createCache, CacheKeys } from "../../utils/cache.js";
import type { CacheClient } from "../../utils/cache.js";
import { AppError } from "../../utils/errors.js";
import { MessageHookService } from "../message/message-hooks.service.js";
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
  const survey = row.survey as Record<string, unknown> | null;
  const template = row.template as Record<string, unknown> | null;
  const submitter = row.submitter as Record<string, unknown>;

  const title =
    row.review_type === "template"
      ? ((template?.title as string) ?? (survey?.title as string) ?? "")
      : ((survey?.title as string) ?? "");

  const category = row.review_type === "template" ? ((template?.category as string) ?? null) : null;

  return {
    review_id: bigIntToStr(row.id as bigint),
    survey_id: row.survey_id ? bigIntToStr(row.survey_id as bigint) : null,
    template_id: row.template_id ? bigIntToStr(row.template_id as bigint) : null,
    survey_title: title,
    category,
    submitter_name: submitter.username as string,
    review_type: row.review_type as ReviewType,
    status: row.status as ReviewListItem["status"],
    submit_message: (row.submit_message as string) ?? null,
    submitted_at: (row.submitted_at as Date).toISOString()
  };
}

// ─── Service 类 ────────────────────────────────────────────────

export class ReviewService {
  private readonly cache: CacheClient;

  constructor(private readonly fastify: FastifyInstance) {
    this.cache = createCache(fastify);
  }

  /** 审核操作后清除问卷列表缓存，确保前端查询时获取最新审核状态 */
  private async invalidateSurveyCache(surveyId: bigint, userId: bigint): Promise<void> {
    await this.cache.del(CacheKeys.surveyDetail(bigIntToStr(surveyId)));
    await this.cache.delByPattern(CacheKeys.surveyListPattern(bigIntToStr(userId)));
  }

  // ============================================================
  //  审核列表查询
  // ============================================================

  /**
   * 分页查询审核列表
   *
   * 查询逻辑：
   *   1. 按 status 筛选 Review 记录
   *   2. 关联查询 surveys 表 / templates 表和 users 表
   *   3. 按 submitted_at 降序排列（最新提交在前）
   */
  async listReviews(query: ReviewListQueryInput): Promise<ReviewListResponse> {
    const { review_type, status, page, page_size, category } = query;

    this.fastify.log.info({ query: { review_type, status, page, page_size, category } }, "[review] 查询审核列表");

    // ── status = "none"：查询 surveys 表中尚未提交审核的问卷 ──
    if (status === "none") {
      return this.listUnreviewedSurveys(review_type, page, page_size, category);
    }

    // ── 常规审核记录查询（reviews 表）──
    const where: Record<string, unknown> = { review_type, status };

    // 模板审核按分类筛选
    if (category && review_type === "template") {
      where.template = { category };
    }

    const [records, total] = await Promise.all([
      this.fastify.prisma.review.findMany({
        where,
        include: {
          survey: {
            select: { title: true }
          },
          template: {
            select: { title: true, category: true }
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
   * 使用 Prisma 关系过滤 `reviews: { none: {...} }` 生成 NOT EXISTS 子查询
   */
  private async listUnreviewedSurveys(
    review_type: string,
    page: number,
    page_size: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    category?: string | undefined
  ): Promise<ReviewListResponse> {
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

    const [surveys, total] = await Promise.all([
      this.fastify.prisma.survey.findMany({
        where,
        select: {
          id: true,
          title: true,
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
      template_id: null,
      survey_title: s.title,
      category: null,
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
   * 获取审核详情（含问卷/模板完整题目内容）
   *
   * 方案B适配：
   *   - 问卷审核：加载 surveys 表 + survey_components
   *   - 模板审核：加载 surveys 表（审核前）或 templates 表（审核后）
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
        template: {
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

    // 按审核类型决定从哪个表加载组件
    // 模板审核时优先取 template 表（审核通过后存在），回退到 survey 表（审核中时）
    const source = (review.template ?? review.survey) as Record<string, unknown> | null;
    const components = review.template?.components ?? review.survey?.components ?? [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const componentItems = components.map((c: any) => ({
      id: bigIntToStr(c.id),
      type: c.type,
      config: c.config as Record<string, unknown>,
      order_index: c.order_index,
      required: c.required as 0 | 1
    }));

    const result: ReviewDetail = {
      review_id: bigIntToStr(review.id),
      survey_id: review.survey_id ? bigIntToStr(review.survey_id) : null,
      template_id: review.template_id ? bigIntToStr(review.template_id) : null,
      survey_title: (source?.title as string) ?? "",
      survey_description: (source?.description as string) ?? null,
      category: (source?.category as string) ?? null,
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
      components: componentItems
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
   * 事务操作（方案B）：
   *   1. 校验 Review 状态是否为 pending（防止重复审核）
   *   2. 更新 Review：status → approved, reviewer_id, reviewed_at, review_comment
   *   3. 按 review_type 区分处理：
   *      - survey：更新 Survey.review_status → approved（问卷审核通过，可发布）
   *      - template：创建 Template 记录（深拷贝问卷数据），更新 template_id
   *   4. 写入审计日志（fire-and-forget）
   *   5. 模板审核通过时异步重建 RAG 检索索引（fire-and-forget）
   */
  async approveReview(adminId: bigint, reviewId: bigint, input: ApproveReviewInput): Promise<ReviewActionResponse> {
    this.fastify.log.info({ adminId: bigIntToStr(adminId), reviewId: bigIntToStr(reviewId) }, "[review] 审核通过请求");

    // 提前读取 survey_id + submitter_id（+ 问卷标题，供审核结果通知使用），用于审核后清除缓存
    const preRead = await this.fastify.prisma.review.findUnique({
      where: { id: reviewId },
      select: { survey_id: true, submitter_id: true, survey: { select: { title: true } } }
    });

    const review = await this.fastify.prisma.$transaction(async tx => {
      const existing = await tx.review.findUnique({ where: { id: reviewId } });
      if (!existing) {
        throw new AppError("审核记录不存在", 404);
      }
      if (existing.status !== "pending") {
        throw new AppError("该审核记录已处理，无法重复操作", 409);
      }

      const now = new Date();

      // 模板审核通过：创建 Template 记录
      if (existing.review_type === "template" && existing.survey_id) {
        // 加载源问卷及组件
        const sourceSurvey = await tx.survey.findUnique({
          where: { id: existing.survey_id },
          include: { components: true }
        });

        if (!sourceSurvey) {
          throw new AppError("源问卷已被删除，无法创建模板", 404);
        }

        // 创建模板记录
        const template = await tx.template.create({
          data: {
            user_id: existing.submitter_id,
            title: sourceSurvey.title,
            description: sourceSurvey.description,
            category: existing.category ?? null,
            source_survey_id: existing.survey_id,
            review_status: "approved"
          }
        });

        // 深拷贝组件
        if (sourceSurvey.components.length > 0) {
          await tx.templateComponent.createMany({
            data: sourceSurvey.components.map(c => ({
              template_id: template.id,
              type: c.type,
              config: c.config as object,
              order_index: c.order_index,
              required: c.required
            }))
          });
        }

        // 更新审核记录
        const updated = await tx.review.update({
          where: { id: reviewId },
          data: {
            status: "approved",
            reviewer_id: adminId,
            template_id: template.id,
            review_comment: input.review_comment ?? null,
            reviewed_at: now
          }
        });

        return updated;
      }

      // 问卷审核通过：标记为已通过
      if (existing.survey_id) {
        await tx.survey.update({
          where: { id: existing.survey_id },
          data: { review_status: "approved" }
        });
      }

      const updated = await tx.review.update({
        where: { id: reviewId },
        data: {
          status: "approved",
          reviewer_id: adminId,
          review_comment: input.review_comment ?? null,
          reviewed_at: now
        }
      });

      return updated;
    });

    // 异步写入审计日志
    createAuditLog(this.fastify, adminId, "approve_review", "review", reviewId, {
      survey_id: review.survey_id ? bigIntToStr(review.survey_id) : null,
      template_id: review.template_id ? bigIntToStr(review.template_id) : null,
      comment: input.review_comment
    }).catch(() => {});

    // 模板审核通过：异步重建 RAG 检索索引（fire-and-forget，索引失败不影响审核结果）
    if (review.template_id) {
      this.fastify.aiRag?.indexer.indexTemplate(review.template_id).catch(() => {});
    }

    // 清除问卷缓存：审核后 survey.review_status 已更新，需让前端查询获取最新状态
    if (preRead?.survey_id && preRead?.submitter_id) {
      this.invalidateSurveyCache(preRead.survey_id, preRead.submitter_id).catch(() => {});
    }

    // 触发审核通过的系统通知（消息系统，失败不影响审核主流程）
    if (preRead?.submitter_id && preRead?.survey_id) {
      new MessageHookService(this.fastify)
        .onReviewApproved(preRead.submitter_id, preRead.survey_id, preRead.survey?.title ?? "")
        .catch(() => {});
    }

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
   *   - survey：Survey.review_status → rejected
   *   - template：仅更新 Review 记录，不创建模板，不改变问卷状态
   */
  async rejectReview(adminId: bigint, reviewId: bigint, input: RejectReviewInput): Promise<ReviewActionResponse> {
    this.fastify.log.info({ adminId: bigIntToStr(adminId), reviewId: bigIntToStr(reviewId) }, "[review] 审核驳回请求");

    const preRead = await this.fastify.prisma.review.findUnique({
      where: { id: reviewId },
      select: { survey_id: true, submitter_id: true, survey: { select: { title: true } } }
    });

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

      // 按审核类型区分处理
      if (existing.review_type === "template") {
        // 模板审核驳回：不创建模板，不改变问卷状态
      } else if (existing.survey_id) {
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
      survey_id: review.survey_id ? bigIntToStr(review.survey_id) : null,
      template_id: review.template_id ? bigIntToStr(review.template_id) : null,
      comment: input.review_comment
    }).catch(() => {});

    // 清除问卷缓存
    if (preRead?.survey_id && preRead?.submitter_id) {
      this.invalidateSurveyCache(preRead.survey_id, preRead.submitter_id).catch(() => {});
    }

    // 触发审核驳回的系统通知（消息系统，失败不影响审核主流程）
    if (preRead?.submitter_id && preRead?.survey_id) {
      new MessageHookService(this.fastify)
        .onReviewRejected(preRead.submitter_id, preRead.survey_id, preRead.survey?.title ?? "", input.review_comment)
        .catch(() => {});
    }

    this.fastify.log.info({ reviewId: bigIntToStr(reviewId), status: "rejected" }, "[review] 审核驳回完成");

    return {
      review_id: bigIntToStr(review.id),
      status: review.status,
      reviewed_at: review.reviewed_at!.toISOString()
    };
  }
}
