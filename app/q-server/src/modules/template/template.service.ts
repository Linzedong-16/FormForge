/**
 * 模板模块 — 业务逻辑层
 *
 * 职责：
 *   - 模板市场列表查询（分页 + 分类筛选 + 排序）
 *   - 模板详情查询（含完整组件内容）
 *   - 使用模板创建个人问卷（深拷贝组件数据）
 *   - 模板评分（含平均分重算）
 *   - 审计日志写入
 */

import type { FastifyInstance } from "fastify";
import { createCache, CacheTTL } from "../../utils/cache.js";
import type { CacheClient } from "../../utils/cache.js";
import { createAuditLog } from "../../utils/audit-log.js";
import { buildPagination } from "../../utils/pagination.js";
import { AppError } from "../../utils/errors.js";
import { MessageHookService } from "../message/message-hooks.service.js";
import type { TemplateListQueryInput, UseTemplateInput, RateTemplateInput } from "./template.schemas.js";
import type {
  TemplateListItem,
  TemplateDetail,
  TemplateListResponse,
  UseTemplateResponse,
  RateTemplateResponse,
  SurveyComponentDetail
} from "@common/survey/survey.interface.js";

// ─── 工具函数 ──────────────────────────────────────────────────

const CACHE_TTL_TEMPLATE = CacheTTL.SURVEY;

function bigIntToStr(value: bigint): string {
  return String(value);
}

/** 将 Prisma Template 行转为 TemplateListItem */
function toTemplateListItem(template: Record<string, unknown>): TemplateListItem {
  return {
    id: bigIntToStr(template.id as bigint),
    user_id: bigIntToStr(template.user_id as bigint),
    title: template.title as string,
    description: (template.description as string) ?? null,
    category: (template.category as TemplateListItem["category"]) ?? null,
    cover_url: (template.cover_url as string) ?? null,
    download_count: template.download_count as number,
    rating: template.rating != null ? String(template.rating) : null,
    review_status: template.review_status as TemplateListItem["review_status"],
    created_at: (template.created_at as Date).toISOString(),
    updated_at: (template.updated_at as Date).toISOString()
  };
}

/** 将组件转为 SurveyComponentDetail */
function toComponentDetail(comp: Record<string, unknown>): SurveyComponentDetail {
  return {
    id: bigIntToStr(comp.id as bigint),
    survey_id: "", // 模板组件无 survey_id
    type: comp.type as string,
    config: (comp.config as Record<string, unknown>) ?? {},
    order_index: comp.order_index as number,
    required: comp.required as SurveyComponentDetail["required"],
    created_at: (comp.created_at as Date).toISOString(),
    updated_at: (comp.updated_at as Date).toISOString()
  };
}

// ─── Service 类 ────────────────────────────────────────────────

export class TemplateService {
  private readonly cache: CacheClient;

  constructor(private readonly fastify: FastifyInstance) {
    this.cache = createCache(fastify);
  }

  // ============================================================
  //  模板列表
  // ============================================================

  /**
   * 分页查询模板市场列表
   *
   * 查询逻辑：
   *   1. 仅返回审核通过的模板（review_status = "approved"）
   *   2. 支持按分类筛选
   *   3. 支持按热门/评分/最新排序
   *   4. 支持关键词搜索（标题模糊匹配）
   */
  async list(query: TemplateListQueryInput): Promise<TemplateListResponse> {
    const { page, page_size, category, keyword, sort } = query;

    this.fastify.log.info({ query }, "[template] 查询模板列表");

    const where: Record<string, unknown> = {
      review_status: "approved"
    };
    if (category) where.category = category;
    if (keyword) where.title = { contains: keyword };

    // 排序映射
    const orderBy: Record<string, string> = {};
    switch (sort) {
      case "popular":
        orderBy.download_count = "desc";
        break;
      case "rating":
        orderBy.rating = "desc";
        break;
      default:
        orderBy.created_at = "desc";
    }

    const cacheKey = `template:list:${page}:${page_size}:${category ?? "all"}:${sort}:${keyword ?? ""}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const [items, total] = await Promise.all([
          this.fastify.prisma.template.findMany({
            where,
            select: {
              id: true,
              user_id: true,
              title: true,
              description: true,
              category: true,
              cover_url: true,
              download_count: true,
              rating: true,
              review_status: true,
              created_at: true,
              updated_at: true
            },
            orderBy,
            ...buildPagination({ page, pageSize: page_size })
          }),
          this.fastify.prisma.template.count({ where })
        ]);

        this.fastify.log.info({ total, returned: items.length }, "[template] 模板列表查询完成");

        return {
          templates: (items as Record<string, unknown>[]).map(toTemplateListItem),
          total,
          page,
          page_size
        };
      },
      CACHE_TTL_TEMPLATE
    );
  }

  // ============================================================
  //  模板详情
  // ============================================================

  /**
   * 获取模板详情（含完整组件内容）
   */
  async getById(templateId: bigint): Promise<TemplateDetail> {
    const cacheKey = `template:detail:${bigIntToStr(templateId)}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const template = await this.fastify.prisma.template.findUnique({
          where: { id: templateId },
          include: {
            components: {
              orderBy: { order_index: "asc" }
            }
          }
        });

        if (!template) {
          throw new AppError("模板不存在", 404);
        }

        const raw = template as unknown as Record<string, unknown>;
        return {
          ...toTemplateListItem(raw),
          source_survey_id: raw.source_survey_id ? bigIntToStr(raw.source_survey_id as bigint) : null,
          components: ((raw.components as Record<string, unknown>[]) ?? []).map(toComponentDetail)
        };
      },
      CACHE_TTL_TEMPLATE
    );
  }

  // ============================================================
  //  使用模板创建问卷
  // ============================================================

  /**
   * 基于模板创建个人问卷
   *
   * 流程：
   *   1. 查询模板及组件
   *   2. 事务内创建新问卷 + 拷贝组件
   *   3. 模板使用次数 +1
   *   4. 写入审计日志
   */
  async useTemplate(userId: bigint, templateId: bigint, input: UseTemplateInput): Promise<UseTemplateResponse> {
    const template = await this.fastify.prisma.template.findUnique({
      where: { id: templateId },
      include: {
        components: {
          orderBy: { order_index: "asc" }
        }
      }
    });

    if (!template) {
      throw new AppError("模板不存在", 404);
    }

    const surveyTitle = input.title ?? template.title;

    const survey = await this.fastify.prisma.$transaction(async tx => {
      // 1. 创建新问卷
      const created = await tx.survey.create({
        data: {
          user_id: userId,
          title: surveyTitle,
          description: template.description,
          page_size: 10,
          total_questions: template.components.length,
          status: 0, // 草稿
          is_public: 0,
          review_status: "none"
        }
      });

      // 2. 拷贝模板组件
      if (template.components.length > 0) {
        await tx.surveyComponent.createMany({
          data: template.components.map(c => ({
            survey_id: created.id,
            type: c.type,
            config: c.config as object,
            order_index: c.order_index,
            required: c.required
          }))
        });
      }

      // 3. 模板使用次数 +1
      await tx.template.update({
        where: { id: templateId },
        data: { download_count: { increment: 1 } }
      });

      return created;
    });

    // 清除模板缓存
    await this.cache.del(`template:detail:${bigIntToStr(templateId)}`);
    await this.cache.delByPattern("template:list:*");

    // 审计日志
    createAuditLog(this.fastify, userId, "use_template", "template", templateId, {
      survey_id: bigIntToStr(survey.id),
      template_title: template.title
    }).catch(() => {});

    // 触发模板被应用的通知（消息系统；应用自己的模板不通知自己）
    if (template.user_id !== userId) {
      new MessageHookService(this.fastify)
        .onTemplateApplied(template.user_id, templateId, template.title)
        .catch(() => {});
    }

    return {
      survey_id: bigIntToStr(survey.id),
      title: survey.title,
      created_at: survey.created_at.toISOString()
    };
  }

  // ============================================================
  //  模板评分
  // ============================================================

  /**
   * 对模板评分（1-5 分）
   *
   * 流程：
   *   1. 校验模板存在且已审核通过
   *   2. 不允许作者给自己的模板评分
   *   3. Upsert 评分记录（同一用户同一模板仅一条）
   *   4. 重新计算模板平均评分
   */
  async rate(userId: bigint, templateId: bigint, input: RateTemplateInput): Promise<RateTemplateResponse> {
    const template = await this.fastify.prisma.template.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new AppError("模板不存在", 404);
    }

    if (template.user_id === userId) {
      throw new AppError("不能给自己的模板评分", 403);
    }

    let newRating = 0;

    await this.fastify.prisma.$transaction(async tx => {
      // 1. Upsert 评分记录
      await tx.templateRating.upsert({
        where: {
          template_id_user_id: {
            template_id: templateId,
            user_id: userId
          }
        },
        create: {
          template_id: templateId,
          user_id: userId,
          score: input.score
        },
        update: {
          score: input.score
        }
      });

      // 2. 重新计算平均评分
      const aggregate = await tx.templateRating.aggregate({
        where: { template_id: templateId },
        _avg: { score: true }
      });

      const avgRating = aggregate._avg.score ?? 0;

      await tx.template.update({
        where: { id: templateId },
        data: { rating: avgRating }
      });

      newRating = avgRating;
    });

    // 清除缓存
    await this.cache.del(`template:detail:${bigIntToStr(templateId)}`);
    await this.cache.delByPattern("template:list:*");

    // 审计日志
    createAuditLog(this.fastify, userId, "rate_template", "template", templateId, {
      score: input.score
    }).catch(() => {});

    // 触发模板收到评分的通知（消息系统，评分自己的模板已在上方被拒绝，不会自我通知）
    new MessageHookService(this.fastify)
      .onTemplateRated(template.user_id, templateId, template.title, input.score)
      .catch(() => {});

    return {
      rating: String(newRating)
    };
  }
}
