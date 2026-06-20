/**
 * 问卷模块 — 业务逻辑层
 *
 * 职责：
 *   - 问卷 CRUD（创建、列表、详情、更新、软删除）
 *   - 组件批量管理（创建、全量替换）
 *   - 缓存管理（Cache-Aside 模式）
 *   - 审计日志写入
 *   - 公共模板保护逻辑
 */

import type { FastifyInstance } from "fastify";
import { createCache, CacheKeys, CacheTTL } from "../../utils/cache.js";
import type { CacheClient } from "../../utils/cache.js";
import { createAuditLog } from "../../utils/audit-log.js";
import { buildPagination } from "../../utils/pagination.js";
import { AppError } from "../../utils/errors.js";
import type {
  CreateSurveyInput,
  UpdateSurveyInput,
  SurveyListQueryInput,
  ApplyTemplateInput
} from "./survey.schemas.js";
import type {
  SurveyListItem,
  SurveyComponentDetail,
  SurveyDetail,
  CreateSurveyResponse,
  SurveyListResponse,
  ApplyTemplateResponse
} from "@common/survey/survey.interface.js";

// ─── 工具函数 ──────────────────────────────────────────────────

const CACHE_TTL_SURVEY = CacheTTL.SURVEY;

function bigIntToStr(value: bigint): string {
  return String(value);
}

/** 统计题目数量（排除 text_note 类型的展示组件） */
function countQuestions(
  components: Array<{ type: string; config: Record<string, unknown>; order_index: number; required: 0 | 1 }>
): number {
  return components.filter(c => c.type !== "text_note").length;
}

/** 将 Prisma Survey 行转为 SurveyListItem */
function toSurveyListItem(survey: Record<string, unknown>): SurveyListItem {
  return {
    id: bigIntToStr(survey.id as bigint),
    user_id: bigIntToStr(survey.user_id as bigint),
    title: survey.title as string,
    description: (survey.description as string) ?? null,
    status: survey.status as SurveyListItem["status"],
    page_size: survey.page_size as number,
    total_questions: survey.total_questions as number,
    responses_count: survey.responses_count as number,
    is_public: survey.is_public as SurveyListItem["is_public"],
    survey_type: survey.survey_type as SurveyListItem["survey_type"],
    review_status: survey.review_status as SurveyListItem["review_status"],
    category: (survey.category as SurveyListItem["category"]) ?? null,
    cover_url: (survey.cover_url as string) ?? null,
    download_count: survey.download_count as number,
    rating: survey.rating != null ? String(survey.rating) : null,
    created_at: (survey.created_at as Date).toISOString(),
    updated_at: (survey.updated_at as Date).toISOString(),
    published_at: survey.published_at ? (survey.published_at as Date).toISOString() : null,
    closed_at: survey.closed_at ? (survey.closed_at as Date).toISOString() : null
  };
}

/** 将 Prisma SurveyComponent 行转为 SurveyComponentDetail */
function toComponentDetail(comp: Record<string, unknown>): SurveyComponentDetail {
  return {
    id: bigIntToStr(comp.id as bigint),
    survey_id: bigIntToStr(comp.survey_id as bigint),
    type: comp.type as string,
    config: (comp.config as Record<string, unknown>) ?? {},
    order_index: comp.order_index as number,
    required: comp.required as SurveyComponentDetail["required"],
    created_at: (comp.created_at as Date).toISOString(),
    updated_at: (comp.updated_at as Date).toISOString()
  };
}

// ─── Service 类 ────────────────────────────────────────────────

export class SurveyService {
  private readonly cache: CacheClient;

  constructor(private readonly fastify: FastifyInstance) {
    this.cache = createCache(fastify);
  }

  // ── 私有工具方法 ────────────────────────────────────────────

  /** 全量替换组件 — 事务内调用 */
  private async replaceComponents(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    surveyId: bigint,
    components: Array<{ type: string; config: Record<string, unknown>; order_index: number; required: 0 | 1 }>
  ): Promise<void> {
    await tx.surveyComponent.deleteMany({ where: { survey_id: surveyId } });
    if (components.length > 0) {
      await tx.surveyComponent.createMany({
        data: components.map(c => ({
          survey_id: surveyId,
          type: c.type,
          config: c.config as object,
          order_index: c.order_index,
          required: c.required
        }))
      });
    }
  }

  /** 清除该问卷的全部缓存 */
  private async invalidateCache(surveyId: bigint, userId: bigint): Promise<void> {
    await this.cache.del(CacheKeys.surveyDetail(bigIntToStr(surveyId)));
    await this.cache.delByPattern(CacheKeys.surveyListPattern(bigIntToStr(userId)));
  }

  // ============================================================
  //  创建问卷
  // ============================================================
  async create(userId: bigint, input: CreateSurveyInput): Promise<CreateSurveyResponse> {
    const { components, ...surveyData } = input;

    const survey = await this.fastify.prisma.$transaction(async tx => {
      // 1. 创建问卷记录
      const created = await tx.survey.create({
        data: {
          user_id: userId,
          title: surveyData.title,
          description: surveyData.description ?? null,
          status: surveyData.status ?? 0,
          page_size: surveyData.page_size ?? 10,
          total_questions: countQuestions(components ?? []),
          is_public: surveyData.is_public ?? 0,
          access_code: surveyData.access_code ?? null,
          survey_type: "personal",
          review_status: "none"
        }
      });

      // 2. 批量创建组件（使用 createMany 优化批量写入）
      if (components && components.length > 0) {
        await tx.surveyComponent.createMany({
          data: components.map(c => ({
            survey_id: created.id,
            type: c.type,
            config: c.config as object,
            order_index: c.order_index,
            required: c.required
          }))
        });
      }

      return created;
    });

    // 写审计日志（不阻塞响应）
    await createAuditLog(this.fastify, userId, "create_survey", "survey", survey.id, {
      title: survey.title
    });

    // 清除列表缓存
    await this.cache.delByPattern(CacheKeys.surveyListPattern(bigIntToStr(userId)));

    return {
      survey_id: bigIntToStr(survey.id),
      title: survey.title,
      status: survey.status,
      created_at: survey.created_at.toISOString()
    };
  }

  // ============================================================
  //  问卷列表
  // ============================================================
  async list(userId: bigint, query: SurveyListQueryInput): Promise<SurveyListResponse> {
    const { page, page_size, status, keyword } = query;

    const where: Record<string, unknown> = {
      user_id: userId,
      deleted_at: null
    };
    if (status !== undefined) where.status = status;
    if (keyword) where.title = { contains: keyword };

    const cacheKey = CacheKeys.surveyList(bigIntToStr(userId), page, page_size, String(status ?? "all"), keyword ?? "");

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const [items, total] = await Promise.all([
          this.fastify.prisma.survey.findMany({
            where,
            orderBy: { updated_at: "desc" },
            ...buildPagination({ page, pageSize: page_size })
          }),
          this.fastify.prisma.survey.count({ where })
        ]);

        return {
          surveys: (items as Record<string, unknown>[]).map(toSurveyListItem),
          total,
          page,
          page_size
        };
      },
      CACHE_TTL_SURVEY
    );
  }

  // ============================================================
  //  问卷详情
  // ============================================================
  async getById(userId: bigint, surveyId: bigint): Promise<SurveyDetail> {
    const cacheKey = CacheKeys.surveyDetail(bigIntToStr(surveyId));

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const survey = await this.fastify.prisma.survey.findFirst({
          where: {
            id: surveyId,
            user_id: userId,
            deleted_at: null
          },
          include: {
            components: {
              orderBy: { order_index: "asc" }
            }
          }
        });

        if (!survey) {
          throw new AppError("问卷不存在", 404);
        }

        const raw = survey as Record<string, unknown>;
        return {
          ...toSurveyListItem(raw),
          access_code: (raw.access_code as string) ?? null,
          components: ((raw.components as Record<string, unknown>[]) ?? []).map(toComponentDetail)
        };
      },
      CACHE_TTL_SURVEY
    );
  }

  // ============================================================
  //  更新问卷
  // ============================================================
  async update(userId: bigint, surveyId: bigint, input: UpdateSurveyInput): Promise<SurveyDetail> {
    // 先查原始记录
    const existing = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null }
    });
    if (!existing) throw new AppError("问卷不存在", 404);

    // 公共模板保护
    if (existing.survey_type === "template" && existing.review_status === "approved") {
      throw new AppError("公共模板不可直接修改，请先复制为个人问卷", 403);
    }

    const { components, ...surveyData } = input;

    await this.fastify.prisma.$transaction(async tx => {
      // 1. 更新问卷元数据
      const updateData: Record<string, unknown> = {};
      if (surveyData.title !== undefined) updateData.title = surveyData.title;
      if (surveyData.description !== undefined) updateData.description = surveyData.description;
      if (surveyData.status !== undefined) updateData.status = surveyData.status;
      if (surveyData.page_size !== undefined) updateData.page_size = surveyData.page_size;
      if (surveyData.is_public !== undefined) updateData.is_public = surveyData.is_public;
      if (surveyData.access_code !== undefined) updateData.access_code = surveyData.access_code;

      // 若组件有变更，更新题目数
      if (components) {
        updateData.total_questions = countQuestions(components);
      }

      // 若原为已审核模板且组件有变更，需重新审核
      if (existing.review_status === "approved" && existing.survey_type === "template" && components) {
        updateData.review_status = "none";
      }

      await tx.survey.update({
        where: { id: surveyId, user_id: userId },
        data: updateData
      });

      // 2. 全量替换组件
      if (components) {
        await this.replaceComponents(tx, surveyId, components);
      }
    });

    // 审计
    await createAuditLog(this.fastify, userId, "update_survey", "survey", surveyId, {
      updated_fields: Object.keys(surveyData),
      components_updated: !!components
    });

    // 清除缓存
    await this.invalidateCache(surveyId, userId);

    return this.getById(userId, surveyId);
  }

  // ============================================================
  //  软删除问卷
  // ============================================================
  async delete(userId: bigint, surveyId: bigint): Promise<void> {
    const existing = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null }
    });
    if (!existing) throw new AppError("问卷不存在", 404);

    const isTemplateApproved = existing.survey_type === "template" && existing.review_status === "approved";

    // 公共模板：不修改远程数据库，仅返回成功让前端清除本地数据
    if (isTemplateApproved) {
      await createAuditLog(this.fastify, userId, "delete_survey", "survey", surveyId, {
        note: "公共模板，仅前端清除本地数据"
      });
      return;
    }

    await this.fastify.prisma.$transaction(async tx => {
      // 审核中：关闭审核记录
      if (existing.review_status === "pending") {
        await tx.review.updateMany({
          where: {
            survey_id: surveyId,
            status: "pending"
          },
          data: {
            status: "rejected",
            review_comment: "问卷已由用户删除"
          }
        });
      }

      await tx.survey.update({
        where: { id: surveyId, user_id: userId },
        data: {
          review_status: "none",
          deleted_at: new Date()
        }
      });
    });

    await createAuditLog(this.fastify, userId, "delete_survey", "survey", surveyId, {
      was_template: false
    });

    await this.invalidateCache(surveyId, userId);
  }

  // ============================================================
  //  发布问卷
  // ============================================================
  async publish(userId: bigint, surveyId: bigint): Promise<SurveyDetail> {
    const existing = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null }
    });
    if (!existing) throw new AppError("问卷不存在", 404);
    if (existing.status === 1) throw new AppError("问卷已发布，无需重复操作", 409);
    if (existing.status === 2) throw new AppError("已关闭的问卷无法发布", 409);

    await this.fastify.prisma.survey.update({
      where: { id: surveyId, user_id: userId },
      data: {
        status: 1,
        published_at: new Date()
      }
    });

    await createAuditLog(this.fastify, userId, "publish_survey", "survey", surveyId);

    await this.invalidateCache(surveyId, userId);

    return this.getById(userId, surveyId);
  }

  // ============================================================
  //  关闭问卷
  // ============================================================
  async close(userId: bigint, surveyId: bigint): Promise<SurveyDetail> {
    const existing = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null }
    });
    if (!existing) throw new AppError("问卷不存在", 404);
    if (existing.status === 2) throw new AppError("问卷已关闭，无需重复操作", 409);
    if (existing.status === 0) throw new AppError("草稿状态的问卷无需关闭", 409);

    await this.fastify.prisma.survey.update({
      where: { id: surveyId, user_id: userId },
      data: {
        status: 2,
        closed_at: new Date()
      }
    });

    await createAuditLog(this.fastify, userId, "close_survey", "survey", surveyId);

    await this.invalidateCache(surveyId, userId);

    return this.getById(userId, surveyId);
  }

  // ============================================================
  //  申请共享模板
  // ============================================================
  async applyTemplate(userId: bigint, surveyId: bigint, input: ApplyTemplateInput): Promise<ApplyTemplateResponse> {
    const existing = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null }
    });
    if (!existing) throw new AppError("问卷不存在", 404);

    const review = await this.fastify.prisma.$transaction(async tx => {
      // 事务内检查：防止并发创建多条审核记录
      const pendingReview = await tx.review.findFirst({
        where: { survey_id: surveyId, status: "pending" }
      });
      if (pendingReview) {
        throw new AppError("该问卷已有审核中的申请", 409);
      }

      // 1. 更新问卷：标记为模板 + 审核中（含组件变更时同步更新题目数）
      const updateData: Record<string, unknown> = {
        survey_type: "template",
        review_status: "pending",
        is_public: 1,
        category: input.category
      };
      if (input.components && input.components.length > 0) {
        updateData.total_questions = countQuestions(input.components);
      }

      await tx.survey.update({
        where: { id: surveyId, user_id: userId },
        data: updateData
      });

      // 2. 若有组件更新，同步保存
      if (input.components && input.components.length > 0) {
        await this.replaceComponents(tx, surveyId, input.components);
      }

      // 3. 创建审核记录
      return tx.review.create({
        data: {
          survey_id: surveyId,
          submitter_id: userId,
          status: "pending",
          submit_message: input.submit_message ?? null
        }
      });
    });

    await createAuditLog(this.fastify, userId, "apply_template", "survey", surveyId, {
      review_id: bigIntToStr(review.id),
      category: input.category
    });

    await this.invalidateCache(surveyId, userId);

    return {
      review_id: bigIntToStr(review.id),
      status: review.status
    };
  }

  // ============================================================
  //  答卷详情
  // ============================================================
  async getResponseById(userId: bigint, responseId: bigint): Promise<Record<string, unknown>> {
    const response = await this.fastify.prisma.response.findFirst({
      where: { id: responseId },
      include: {
        survey: {
          select: {
            id: true,
            user_id: true,
            title: true
          }
        },
        answers: true
      }
    });

    if (!response) {
      throw new AppError("答卷不存在", 404);
    }

    // 权限校验：只能查看自己问卷的答卷 或 自己提交的答卷
    const raw = response as unknown as Record<string, unknown>;
    const survey = (raw.survey as Record<string, unknown>) ?? {};
    const isOwner = BigInt(survey.user_id as string | number) === userId;
    const isSubmitter = response.user_id === userId;
    if (!isOwner && !isSubmitter) {
      throw new AppError("无权查看该答卷", 403);
    }

    const answers = (raw.answers as Array<Record<string, unknown>> | undefined) ?? [];

    return {
      id: bigIntToStr(response.id),
      survey_id: bigIntToStr(response.survey_id),
      user_id: response.user_id ? bigIntToStr(response.user_id) : null,
      anonymous_id: (response.anonymous_id as string | null) ?? null,
      status: response.status,
      submitted_at: response.submitted_at?.toISOString() ?? null,
      created_at: response.created_at.toISOString(),
      updated_at: response.updated_at.toISOString(),
      answers: answers.map(a => ({
        id: bigIntToStr(a.id as bigint),
        response_id: bigIntToStr(a.response_id as bigint),
        component_id: bigIntToStr(a.component_id as bigint),
        value: (a.value as string) ?? null,
        values: (a.values as string[]) ?? []
      }))
    };
  }

  // ============================================================
  //  删除答卷
  // ============================================================
  async deleteResponse(userId: bigint, responseId: bigint): Promise<void> {
    const response = await this.fastify.prisma.response.findFirst({
      where: { id: responseId },
      include: {
        survey: {
          select: {
            id: true,
            user_id: true
          }
        }
      }
    });

    if (!response) {
      throw new AppError("答卷不存在", 404);
    }

    // 权限校验：只能删除自己问卷的答卷 或 自己提交的答卷
    const survey = response.survey as Record<string, unknown>;
    const isOwner = BigInt(survey.user_id as string | number) === userId;
    const isSubmitter = response.user_id === userId;
    if (!isOwner && !isSubmitter) {
      throw new AppError("无权删除该答卷", 403);
    }

    // 事务内删除答卷及其关联的答案
    await this.fastify.prisma.$transaction(async tx => {
      await tx.answer.deleteMany({ where: { response_id: responseId } });
      await tx.response.delete({ where: { id: responseId } });
    });

    await createAuditLog(this.fastify, userId, "delete_response", "response", responseId).catch(() => {});
  }
}
