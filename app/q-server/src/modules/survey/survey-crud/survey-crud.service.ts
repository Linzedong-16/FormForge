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
import { createCache, CacheKeys, CacheTTL } from "../../../utils/cache.js";
import type { CacheClient } from "../../../utils/cache.js";
import { createAuditLog } from "../../../utils/audit-log.js";
import { buildPagination } from "../../../utils/pagination.js";
import { AppError } from "../../../utils/errors.js";
import type {
  CreateSurveyInput,
  UpdateSurveyInput,
  SurveyListQueryInput,
  ApplyTemplateInput,
  SubmitReviewInput,
  SubmitResponseInput,
  ResponseListQueryInput,
  GenerateLinkInput
} from "./survey-crud.schemas.js";
import {
  hashFingerprint,
  generateToken,
  storeToken,
  validateToken,
  consumeToken,
  checkDuplicateSubmit,
  recordSubmit
} from "../../../utils/fingerprint.js";
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

/** 非题目组件类型（仅用于展示，不计入题目总数） */
const NON_QUESTION_TYPES = new Set(["text_note"]);

function bigIntToStr(value: bigint): string {
  return String(value);
}

/** 统计题目数量（排除 text_note 等非题目类型组件） */
function countQuestions(
  components: Array<{ type: string; config: Record<string, unknown>; order_index: number; required: 0 | 1 }>
): number {
  return components.filter(c => !NON_QUESTION_TYPES.has(c.type)).length;
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
    review_status: survey.review_status as SurveyListItem["review_status"],
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
    createAuditLog(this.fastify, userId, "create_survey", "survey", survey.id, {
      title: survey.title
    }).catch(() => {});

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

    const executeQuery = async () => {
      const [items, total] = await Promise.all([
        this.fastify.prisma.survey.findMany({
          where,
          select: {
            id: true,
            user_id: true,
            title: true,
            description: true,
            status: true,
            page_size: true,
            total_questions: true,
            responses_count: true,
            is_public: true,
            review_status: true,
            created_at: true,
            updated_at: true,
            published_at: true,
            closed_at: true
          },
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
    };

    // 搜索请求不缓存（keyword 多变，缓存命中率极低）
    if (keyword) {
      return executeQuery();
    }

    const cacheKey = CacheKeys.surveyList(bigIntToStr(userId), page, page_size, String(status ?? "all"), "");

    return this.cache.getOrSet(cacheKey, executeQuery, CACHE_TTL_SURVEY);
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
  //  问卷公开详情（C 端，无需登录）
  // ============================================================

  /**
   * 获取已发布问卷的公开详情（供 C 端填卷人加载问卷内容）
   *
   * 与 getById 的区别：
   *   - 无需 userId（匿名访问）
   *   - 仅返回 status=1（已发布）的问卷
   *   - 检查问卷截止时间：若已超过截止时间，自动关闭问卷
   *
   * 截止时间校验：
   *   1. 读取 Redis 中的 survey:deadline:{surveyId}
   *   2. 若存在且 currentTime > deadline → 将问卷状态更新为 2（已关闭）→ 返回 404
   *   3. 若不存在 → 正常流程（可能未设置截止时间或 Redis 数据过期）
   */
  async getPublicById(surveyId: bigint): Promise<SurveyDetail> {
    const surveyIdStr = bigIntToStr(surveyId);
    const cacheKey = CacheKeys.surveyDetail(surveyIdStr);

    // 检查是否设置了截止时间（使用统一缓存 Key 规范）
    const deadlineKey = CacheKeys.surveyDeadline(surveyIdStr);
    try {
      const deadlineRaw = await this.fastify.redis.get(deadlineKey);
      if (deadlineRaw) {
        const deadlineData = JSON.parse(deadlineRaw) as { deadline: string };
        const deadlineMs = new Date(deadlineData.deadline).getTime();
        if (Date.now() > deadlineMs) {
          // 截止时间已过，自动关闭问卷
          this.fastify.log.info(
            { surveyId: surveyIdStr, deadline: deadlineData.deadline },
            "[getPublicById] 问卷截止时间已过，自动关闭"
          );
          await this.fastify.prisma.survey.update({
            where: { id: surveyId },
            data: { status: 2, closed_at: new Date() }
          });
          // 清除缓存和 Redis 截止时间标记
          await this.cache.del(cacheKey);
          await this.fastify.redis.del(deadlineKey).catch(() => {});
          throw new AppError("问卷已截止，不再接受填写", 404);
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Redis 读取失败时降级放行（不阻塞问卷访问）
      this.fastify.log.warn({ surveyId: surveyIdStr }, "[getPublicById] Redis 截止时间检查失败，降级放行");
    }

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const survey = await this.fastify.prisma.survey.findFirst({
          where: {
            id: surveyId,
            status: 1,
            deleted_at: null
          },
          include: {
            components: {
              orderBy: { order_index: "asc" }
            }
          }
        });

        if (!survey) {
          throw new AppError("问卷不存在或未发布", 404);
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
    const { components, ...surveyData } = input;

    const result = await this.fastify.prisma.$transaction(async tx => {
      // 事务内查询原始记录，避免 TOCTOU 竞态
      const existing = await tx.survey.findFirst({
        where: { id: surveyId, user_id: userId, deleted_at: null }
      });
      if (!existing) throw new AppError("问卷不存在", 404);

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

      // 同步/保存问卷时，组件有变更则重置审核状态为"未审核"
      if (components) {
        updateData.review_status = "none";
      }

      const updated = await tx.survey.update({
        where: { id: surveyId, user_id: userId },
        data: updateData
      });

      // 2. 全量替换组件
      if (components) {
        await this.replaceComponents(tx, surveyId, components);
      }

      // 3. 事务内加载组件（避免事务后额外查询）
      const loadedComponents = await tx.surveyComponent.findMany({
        where: { survey_id: surveyId },
        orderBy: { order_index: "asc" }
      });

      const raw = updated as unknown as Record<string, unknown>;
      return {
        ...toSurveyListItem(raw),
        access_code: (raw.access_code as string) ?? null,
        components: (loadedComponents as Record<string, unknown>[]).map(toComponentDetail)
      };
    });

    // 审计
    createAuditLog(this.fastify, userId, "update_survey", "survey", surveyId, {
      updated_fields: Object.keys(surveyData),
      components_updated: !!components
    }).catch(() => {});

    // 清除缓存
    await this.invalidateCache(surveyId, userId);

    return result;
  }

  // ============================================================
  //  软删除问卷
  // ============================================================
  async delete(userId: bigint, surveyId: bigint): Promise<void> {
    await this.fastify.prisma.$transaction(async tx => {
      // 事务内查询，避免 TOCTOU 竞态
      const existing = await tx.survey.findFirst({
        where: { id: surveyId, user_id: userId, deleted_at: null }
      });
      if (!existing) throw new AppError("问卷不存在", 404);

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

    // 审计日志（不阻塞响应）
    createAuditLog(this.fastify, userId, "delete_survey", "survey", surveyId).catch(() => {});

    // 文件级联清理：软删除问卷后清除 MinIO 文件 + survey_files 记录
    const { SurveyFileService } = await import("../file/file.service.js");
    const fileService = new SurveyFileService(this.fastify);
    fileService.cleanupBySurvey(surveyId).catch(err => {
      this.fastify.log.warn({ err, surveyId: String(surveyId) }, "问卷删除后文件级联清理失败");
    });

    await this.invalidateCache(surveyId, userId);
  }

  // ============================================================
  //  发布问卷
  // ============================================================
  async publish(userId: bigint, surveyId: bigint): Promise<SurveyDetail> {
    // 事务内校验 + 更新 + 加载组件，避免事务后额外查询
    const result = await this.fastify.prisma.$transaction(async tx => {
      const existing = await tx.survey.findFirst({
        where: { id: surveyId, user_id: userId, deleted_at: null }
      });
      if (!existing) throw new AppError("问卷不存在", 404);
      if (existing.status === 1) throw new AppError("问卷已发布，无需重复操作", 409);
      if (existing.status === 2) throw new AppError("已关闭的问卷无法发布", 409);

      // 所有问卷发布前均需通过问卷审核
      if (existing.review_status !== "approved") {
        throw new AppError("问卷需先通过审核才能发布，请在预览页提交审核", 403);
      }

      const updated = await tx.survey.update({
        where: { id: surveyId, user_id: userId },
        data: {
          status: 1,
          published_at: new Date()
        }
      });

      const loadedComponents = await tx.surveyComponent.findMany({
        where: { survey_id: surveyId },
        orderBy: { order_index: "asc" }
      });

      const raw = updated as unknown as Record<string, unknown>;
      return {
        ...toSurveyListItem(raw),
        access_code: (raw.access_code as string) ?? null,
        components: (loadedComponents as Record<string, unknown>[]).map(toComponentDetail)
      };
    });

    createAuditLog(this.fastify, userId, "publish_survey", "survey", surveyId).catch(() => {});

    await this.invalidateCache(surveyId, userId);

    return result;
  }

  // ============================================================
  //  关闭问卷
  // ============================================================
  async close(userId: bigint, surveyId: bigint): Promise<SurveyDetail> {
    // 事务内校验 + 更新 + 加载组件，避免事务后额外查询
    const result = await this.fastify.prisma.$transaction(async tx => {
      const existing = await tx.survey.findFirst({
        where: { id: surveyId, user_id: userId, deleted_at: null }
      });
      if (!existing) throw new AppError("问卷不存在", 404);
      if (existing.status === 2) throw new AppError("问卷已关闭，无需重复操作", 409);
      if (existing.status === 0) throw new AppError("草稿状态的问卷无需关闭", 409);

      const updated = await tx.survey.update({
        where: { id: surveyId, user_id: userId },
        data: {
          status: 2,
          closed_at: new Date()
        }
      });

      const loadedComponents = await tx.surveyComponent.findMany({
        where: { survey_id: surveyId },
        orderBy: { order_index: "asc" }
      });

      const raw = updated as unknown as Record<string, unknown>;
      return {
        ...toSurveyListItem(raw),
        access_code: (raw.access_code as string) ?? null,
        components: (loadedComponents as Record<string, unknown>[]).map(toComponentDetail)
      };
    });

    createAuditLog(this.fastify, userId, "close_survey", "survey", surveyId).catch(() => {});

    await this.invalidateCache(surveyId, userId);

    return result;
  }

  // ============================================================
  //  提交问卷审核
  // ============================================================

  /**
   * 提交问卷审核（所有个人问卷发布前的必经流程）
   *
   * 流程：
   *   1. 校验问卷是否存在且属于当前用户
   *   2. 防止重复提交（同一问卷不能有进行中的问卷审核）
   *   3. 更新组件（若提供）
   *   4. 更新问卷 review_status → pending
   *   5. 创建问卷审核记录（review_type = "survey"）
   */
  async submitReview(userId: bigint, surveyId: bigint, input: SubmitReviewInput): Promise<ApplyTemplateResponse> {
    const existing = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null }
    });
    if (!existing) throw new AppError("问卷不存在", 404);

    const review = await this.fastify.prisma.$transaction(async tx => {
      // 防止重复提交问卷审核
      const pendingReview = await tx.review.findFirst({
        where: { survey_id: surveyId, review_type: "survey", status: "pending" }
      });
      if (pendingReview) {
        throw new AppError("该问卷已有审核中的申请", 409);
      }

      // 1. 更新问卷审核状态
      const updateData: Record<string, unknown> = {
        review_status: "pending"
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

      // 3. 创建问卷审核记录
      return tx.review.create({
        data: {
          survey_id: surveyId,
          submitter_id: userId,
          review_type: "survey",
          status: "pending",
          submit_message: input.submit_message ?? null
        }
      });
    });

    await createAuditLog(this.fastify, userId, "submit_review", "survey", surveyId, {
      review_id: bigIntToStr(review.id)
    });

    await this.invalidateCache(surveyId, userId);

    return {
      review_id: bigIntToStr(review.id),
      status: review.status
    };
  }

  // ============================================================
  //  申请共享模板
  // ============================================================

  /**
   * 申请成为共享模板（需先通过问卷审核）
   *
   * 前置条件：
   *   - 问卷必须已通过问卷审核（review_status === "approved"）
   *   - 同一问卷不能有进行中的模板审核
   *
   * 流程（方案B：完全解耦）：
   *   1. 不修改问卷的 survey_type（问卷保持独立）
   *   2. 创建模板审核记录（review_type = "template", status = "pending"）
   *   3. 审核通过后，在 templates 表创建独立记录
   */
  async applyTemplate(userId: bigint, surveyId: bigint, input: ApplyTemplateInput): Promise<ApplyTemplateResponse> {
    const existing = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null }
    });
    if (!existing) throw new AppError("问卷不存在", 404);

    // 前置条件：必须先通过问卷审核
    if (existing.review_status !== "approved") {
      throw new AppError("问卷需先通过问卷审核，才能申请成为模板", 403);
    }

    const review = await this.fastify.prisma.$transaction(async tx => {
      // 事务内检查：防止并发创建多条模板审核记录
      const pendingReview = await tx.review.findFirst({
        where: { survey_id: surveyId, review_type: "template", status: "pending" }
      });
      if (pendingReview) {
        throw new AppError("该问卷已有模板审核中的申请", 409);
      }

      // 1. 若有组件更新，同步保存
      if (input.components && input.components.length > 0) {
        await this.replaceComponents(tx, surveyId, input.components);
      }

      // 2. 创建模板审核记录（关联问卷，待审核通过后创建模板）
      return tx.review.create({
        data: {
          survey_id: surveyId,
          submitter_id: userId,
          review_type: "template",
          status: "pending",
          category: input.category,
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
  //  生成定时问卷链接
  // ============================================================

  /**
   * 为指定问卷生成定时填写链接
   *
   * 流程：
   *   1. 校验问卷存在且属于当前用户
   *   2. 校验问卷已通过审核
   *   3. 若未发布则自动发布（状态 0 → 1）
   *   4. 将截止时间存储到 Redis（设置 TTL 为截止时间 + 1 小时缓冲）
   *   5. 返回问卷链接信息
   *
   * Redis 存储：
   *   Key: survey:deadline:{surveyId}
   *   Value: { deadline: ISO, generated_at: timestamp, user_id: string }
   *   TTL: 距截止时间的秒数 + 3600（1小时缓冲）
   */
  async generateSurveyLink(
    userId: bigint,
    surveyId: bigint,
    input: GenerateLinkInput
  ): Promise<{ survey_id: string; link_url: string; deadline: string; status: "active" }> {
    const surveyIdStr = bigIntToStr(surveyId);

    // 事务内校验 + 自动发布（若需要）
    const survey = await this.fastify.prisma.$transaction(async tx => {
      const existing = await tx.survey.findFirst({
        where: { id: surveyId, user_id: userId, deleted_at: null },
        select: { id: true, status: true, review_status: true, title: true }
      });

      if (!existing) {
        throw new AppError("问卷不存在", 404);
      }

      // 必须通过问卷审核
      if (existing.review_status !== "approved") {
        throw new AppError("问卷需先通过审核才能生成填写链接，请在预览页提交审核", 403);
      }

      // 若问卷未发布，自动发布
      if (existing.status !== 1) {
        if (existing.status === 2) {
          throw new AppError("已关闭的问卷无法生成链接", 409);
        }
        // 状态 0（草稿）→ 自动发布
        await tx.survey.update({
          where: { id: surveyId, user_id: userId },
          data: { status: 1, published_at: new Date() }
        });
      }

      return existing;
    });

    // 将截止时间写入 Redis
    const deadlineDate = new Date(input.deadline);
    const deadlineMs = deadlineDate.getTime();
    const nowMs = Date.now();
    // TTL = 距截止时间的秒数 + 1 小时缓冲（确保截止后仍可查询状态）
    const ttlSeconds = Math.ceil((deadlineMs - nowMs) / 1000) + 3600;

    const deadlineKey = CacheKeys.surveyDeadline(surveyIdStr);
    const deadlineValue = JSON.stringify({
      deadline: input.deadline,
      generated_at: new Date().toISOString(),
      user_id: bigIntToStr(userId),
      survey_title: survey.title
    });

    try {
      await this.fastify.redis.set(deadlineKey, deadlineValue, "EX", Math.max(60, ttlSeconds));
    } catch {
      this.fastify.log.warn(`[generateLink] Redis 存储截止时间失败: surveyId=${surveyIdStr}`);
      // Redis 不可用时仍返回成功（截止时间校验降级放行）
    }

    // 写审计日志
    createAuditLog(this.fastify, userId, "generate_survey_link", "survey", surveyId, {
      deadline: input.deadline,
      ttl_seconds: ttlSeconds
    }).catch(() => {});

    // 清除问卷缓存
    await this.invalidateCache(surveyId, userId);

    // 构建前端访问链接（使用环境变量中的前端域名）
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL || "http://localhost:5173";
    const linkUrl = `${frontendBaseUrl}/survey/${surveyIdStr}`;

    return {
      survey_id: surveyIdStr,
      link_url: linkUrl,
      deadline: input.deadline,
      status: "active"
    };
  }

  // ============================================================
  //  答卷详情
  // ============================================================
  async getResponseById(userId: bigint, responseId: bigint): Promise<Record<string, unknown>> {
    const cacheKey = CacheKeys.responseDetail(bigIntToStr(responseId));

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const response = await this.fastify.prisma.response.findFirst({
          where: { id: responseId },
          include: {
            survey: { select: { user_id: true } },
            answers: true
          }
        });

        if (!response) {
          throw new AppError("答卷不存在", 404);
        }

        // 权限校验：仅问卷所有者可查看答卷
        const surveyOwner = response.survey?.user_id;
        if (surveyOwner !== userId) {
          throw new AppError("无权查看该答卷", 403);
        }

        return {
          id: bigIntToStr(response.id),
          survey_id: bigIntToStr(response.survey_id),
          user_id: response.user_id ? bigIntToStr(response.user_id) : null,
          answers: response.answers.map(a => ({
            id: bigIntToStr(a.id),
            component_id: bigIntToStr(a.component_id),
            value: a.value,
            values: a.values
          })),
          created_at: response.created_at.toISOString()
        };
      },
      CacheTTL.SURVEY
    );
  }

  // ============================================================
  //  删除答卷
  // ============================================================
  async deleteResponse(userId: bigint, responseId: bigint): Promise<void> {
    const response = await this.fastify.prisma.response.findFirst({
      where: { id: responseId },
      include: { survey: { select: { user_id: true } } }
    });

    if (!response) {
      throw new AppError("答卷不存在", 404);
    }

    const surveyOwner = response.survey?.user_id;
    if (surveyOwner !== userId) {
      throw new AppError("无权删除该答卷", 403);
    }

    // 删除答案，再删除答卷记录
    await this.fastify.prisma.$transaction([
      this.fastify.prisma.answer.deleteMany({ where: { response_id: responseId } }),
      this.fastify.prisma.response.delete({ where: { id: responseId } })
    ]);

    // 清除答卷缓存
    await this.cache.del(CacheKeys.responseDetail(bigIntToStr(responseId)));

    createAuditLog(this.fastify, userId, "delete_response", "survey_response", responseId).catch(() => {});
  }

  // ============================================================
  //  生成临时 token（防重复提交）
  // ============================================================

  /**
   * 为指定问卷生成临时 token
   *
   * 调用场景：
   *   - 前端加载问卷页面时自动请求
   *   - 前端切换问卷或刷新页面时重新请求
   *
   * Token 特性：
   *   - UUID v4 格式，全局唯一
   *   - 与问卷 ID 绑定，存储在 Redis 中
   *   - 有效期 30 分钟，过期自动清除
   *   - 每个问卷同时可存在多个有效 token（多端/多标签页场景）
   */
  async generateSurveyToken(surveyId: bigint): Promise<{ token: string; expires_in: number }> {
    const token = generateToken();
    const surveyIdStr = bigIntToStr(surveyId);

    await storeToken(this.fastify, surveyIdStr, token);

    return {
      token,
      expires_in: 1800 // 30 分钟
    };
  }

  // ============================================================
  //  提交答卷（含防重复提交校验）
  // ============================================================

  /**
   * 提交答卷（C 端接口，无需登录）
   *
   * 防重复提交流程：
   *   1. 校验 token 是否有效（存在且未过期）
   *   2. 对前端指纹哈希进行服务端二次加盐哈希
   *   3. 检查 Redis 去重记录（fingerprint_hash + token 组合）
   *   4. 若已存在 → 返回 409（重复提交）
   *   5. 若不存在 → 写入答卷数据 + 设置去重标记
   *
   * 兼容性设计：
   *   - Redis 不可用时降级放行，不阻塞正常提交
   *   - Token 不可用时仍允许提交（仅记录警告日志）
   */
  async submitResponse(
    surveyId: bigint,
    input: SubmitResponseInput
  ): Promise<{ response_id: string; submitted_at: string }> {
    const surveyIdStr = bigIntToStr(surveyId);

    // 1. 验证 token 有效性
    const tokenValid = await validateToken(this.fastify, surveyIdStr, input.token);
    if (!tokenValid) {
      throw new AppError("临时凭证已过期，请刷新页面后重新提交", 400);
    }

    // 1.5. 检查问卷截止时间（防止页面加载后截止时间到达仍可提交的竞态）
    try {
      const deadlineRaw = await this.fastify.redis.get(CacheKeys.surveyDeadline(surveyIdStr));
      if (deadlineRaw) {
        const deadlineData = JSON.parse(deadlineRaw) as { deadline: string };
        if (Date.now() > new Date(deadlineData.deadline).getTime()) {
          // 截止时间已过，自动关闭问卷并拒绝提交
          this.fastify.log.info({ surveyId: surveyIdStr }, "[submitResponse] 截止时间已过，拒绝提交并自动关闭");
          await this.fastify.prisma.survey
            .update({
              where: { id: surveyId },
              data: { status: 2, closed_at: new Date() }
            })
            .catch(() => {});
          await this.fastify.redis.del(CacheKeys.surveyDeadline(surveyIdStr)).catch(() => {});
          throw new AppError("问卷已截止，不再接受填写", 400);
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Redis 不可用时降级放行（不阻塞正常提交）
      this.fastify.log.warn({ surveyId: surveyIdStr }, "[submitResponse] 截止时间检查失败，降级放行");
    }

    // 2. 指纹处理：服务端二次加盐哈希
    const serverFingerprintHash = hashFingerprint(input.fingerprint);
    const isFingerprintFallback = input.fingerprint.startsWith("fallback_");

    // 3. 去重检查（降级指纹不具有唯一性，跳过去重）
    if (!isFingerprintFallback) {
      const duplicate = await checkDuplicateSubmit(this.fastify, surveyIdStr, serverFingerprintHash);
      if (duplicate) {
        throw new AppError("请勿重复提交，您已提交过该问卷", 409);
      }
    } else {
      this.fastify.log.info({ surveyId: surveyIdStr }, "[submitResponse] 使用降级指纹，跳过去重检查");
    }

    // 4. 校验问卷存在且已发布
    const survey = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, deleted_at: null },
      select: { id: true, status: true }
    });
    if (!survey) {
      throw new AppError("问卷不存在", 404);
    }
    if (survey.status !== 1) {
      throw new AppError("问卷未发布，无法提交", 400);
    }

    // 5. 事务写入答卷 + 答案
    const response = await this.fastify.prisma.$transaction(async tx => {
      const created = await tx.response.create({
        data: {
          survey_id: surveyId,
          anonymous_id: input.anonymous_id ?? null,
          status: 1, // 已提交
          submitted_at: new Date()
        }
      });

      // 批量创建答案
      if (input.answers.length > 0) {
        const answerRows = input.answers
          .filter(a => a.value !== undefined || (a.values && a.values.length > 0))
          .map(a => ({
            response_id: created.id,
            component_id: BigInt(a.component_id),
            value: a.value ?? null,
            values: a.values ?? null
          }));

        if (answerRows.length > 0) {
          await tx.answer.createMany({ data: answerRows });
        }
      }

      // 更新答卷数缓存
      await tx.survey.update({
        where: { id: surveyId },
        data: { responses_count: { increment: 1 } }
      });

      return created;
    });

    // 6. 消费 token（删除，防止复用）
    await consumeToken(this.fastify, surveyIdStr, input.token);

    // 7. 记录去重标记（降级指纹无唯一性，跳过记录）
    if (!isFingerprintFallback) {
      await recordSubmit(this.fastify, surveyIdStr, serverFingerprintHash, bigIntToStr(response.id));
    }

    // 8. 清除答卷列表缓存 + 统计缓存
    await this.cache.delByPattern(CacheKeys.responsePattern(surveyIdStr));
    // 清除统计缓存（概览 + 单问卷统计）
    await this.cache.del("admin:stats:overview").catch(() => {});
    await this.cache.del(`admin:stats:survey:${surveyIdStr}`).catch(() => {});

    // 写审计日志（C 端匿名提交，user_id 为 null，不阻塞响应）
    createAuditLog(this.fastify, null, "submit_response", "survey_response", response.id, {
      survey_id: surveyIdStr,
      answer_count: input.answers.length
    }).catch(() => {});

    return {
      response_id: bigIntToStr(response.id),
      submitted_at: response.submitted_at!.toISOString()
    };
  }

  // ============================================================
  //  答卷列表
  // ============================================================

  /**
   * 查询指定问卷的答卷列表（分页）
   */
  async listResponses(
    userId: bigint,
    surveyId: bigint,
    query: ResponseListQueryInput
  ): Promise<{
    responses: Array<{
      id: string;
      survey_id: string;
      survey_title: string;
      user_id: string | null;
      anonymous_id: string | null;
      status: number;
      submitted_at: string | null;
      created_at: string;
    }>;
    total: number;
    page: number;
    page_size: number;
  }> {
    const { page, page_size } = query;

    // 校验权限：仅问卷所有者可查看答卷
    const survey = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null },
      select: { id: true, title: true }
    });
    if (!survey) {
      throw new AppError("问卷不存在", 404);
    }

    const where = { survey_id: surveyId };

    const [items, total] = await Promise.all([
      this.fastify.prisma.response.findMany({
        where,
        select: {
          id: true,
          survey_id: true,
          user_id: true,
          anonymous_id: true,
          status: true,
          submitted_at: true,
          created_at: true
        },
        orderBy: { created_at: "desc" },
        ...buildPagination({ page, pageSize: page_size })
      }),
      this.fastify.prisma.response.count({ where })
    ]);

    return {
      responses: (items as Record<string, unknown>[]).map(r => ({
        id: bigIntToStr(r.id as bigint),
        survey_id: bigIntToStr(r.survey_id as bigint),
        survey_title: survey.title,
        user_id: r.user_id ? bigIntToStr(r.user_id as bigint) : null,
        anonymous_id: (r.anonymous_id as string) ?? null,
        status: r.status as number,
        submitted_at: r.submitted_at ? (r.submitted_at as Date).toISOString() : null,
        created_at: (r.created_at as Date).toISOString()
      })),
      total,
      page,
      page_size
    };
  }
}
