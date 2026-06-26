/**
 * 问卷统计模块 — 业务逻辑层
 *
 * 职责：
 *   - 平台统计概览（问卷数、答卷数、日趋势）
 *   - 单问卷详细分析（每题各选项分布、评分统计、文本抽样）
 *   - 答卷原始数据查询（分页、筛选、搜索）
 *   - CSV 报表导出
 *
 * 设计原则：
 *   - 复杂聚合使用 Prisma $queryRaw 或 $queryRawUnsafe 执行原生 SQL
 *   - 简单统计使用 Prisma ORM（count、groupBy、aggregate）
 *   - 统计数据缓存至 Redis（Cache-Aside 模式），新答卷提交时失效
 *   - 所有 BigInt 通过 bigIntToStr 转为 string 以兼容 JSON
 */

import type { FastifyInstance } from "fastify";
import { createCache, CacheTTL } from "../../../utils/cache.js";
import type { CacheClient } from "../../../utils/cache.js";
import { AppError } from "../../../utils/errors.js";
import { buildPagination } from "../../../utils/pagination.js";
import type { StatsOverviewQueryInput, AdminResponseListQueryInput, ExportQueryInput } from "./survey-stats.schemas.js";
import type {
  StatsOverviewResponse,
  SurveyStatsResponse,
  QuestionStats,
  OptionDistribution,
  AdminResponseListResponse,
  AdminResponseItem,
  AnswerWithContext
} from "@common/survey/survey-stats.interface.js";

// ─── 工具函数 ──────────────────────────────────────────────────

function bigIntToStr(value: bigint): string {
  return String(value);
}

/** 非题目组件类型（仅用于展示，不计入统计） */
const NON_QUESTION_TYPES = new Set(["text_note"]);

/** 题目类型 → 中文名称映射（fallback，优先用 config.title.status） */
const TYPE_NAME_MAP: Record<string, string> = {
  single_select: "单选题",
  multi_select: "多选题",
  option_select: "下拉选择",
  single_pic_select: "图片单选",
  multi_pic_select: "图片多选",
  text_input: "文本输入",
  date_time: "日期时间",
  rate_score: "评分题",
  cascader: "多级联动",
  matrix_single: "矩阵单选",
  slider: "滑块题",
  transfer: "排序题",
  signature: "电子签名",
  text_note: "展示说明"
};

/** 需要展开 JSON 数组聚合的题型 */
const JSON_ARRAY_TYPES = new Set(["multi_select", "multi_pic_select", "transfer"]);

/** 需要数值聚合的题型 */
const NUMERIC_TYPES = new Set(["rate_score", "slider"]);

/** 文本类题型 */
const TEXT_TYPES = new Set(["text_input", "text_note"]);

// ─── Service 类 ────────────────────────────────────────────────

export class SurveyStatsService {
  private readonly cache: CacheClient;

  constructor(private readonly fastify: FastifyInstance) {
    this.cache = createCache(fastify);
  }

  // ============================================================
  //  统计概览
  // ============================================================

  /**
   * 获取平台问卷统计概览
   *
   * 性能优化：统计数据缓存 5 分钟（CacheTTL.SURVEY），
   * 避免每次 Dashboard 刷新都执行多个 COUNT 查询
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getOverview(query: StatsOverviewQueryInput): Promise<StatsOverviewResponse> {
    const cacheKey = "admin:stats:overview";
    const cached = await this.cache.get<StatsOverviewResponse>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 并行查询基础统计数据
    const [totalSurveys, publishedSurveys, totalResponses, responsesToday] = await Promise.all([
      this.fastify.prisma.survey.count({ where: { deleted_at: null } }),
      this.fastify.prisma.survey.count({ where: { deleted_at: null, status: 1 } }),
      this.fastify.prisma.response.count(),
      this.fastify.prisma.response.count({
        where: { submitted_at: { gte: todayStart } }
      })
    ]);

    // 本周答卷数
    const responsesThisWeek = await this.fastify.prisma.response.count({
      where: { submitted_at: { gte: weekStart } }
    });

    // 7 天日趋势 — 使用原生 SQL 按天聚合
    const trend7Days = await this.getDailyTrend(7);

    const result: StatsOverviewResponse = {
      total_surveys: totalSurveys,
      published_surveys: publishedSurveys,
      total_responses: totalResponses,
      responses_today: responsesToday,
      responses_this_week: responsesThisWeek,
      trend_7_days: trend7Days
    };

    // 缓存 5 分钟
    await this.cache.set(cacheKey, result, CacheTTL.SURVEY);

    return result;
  }

  // ============================================================
  //  单问卷详细统计
  // ============================================================

  /**
   * 获取单个问卷的详细统计分析
   *
   * 包含：
   *   - 答卷总量、完成率
   *   - 每日答卷趋势
   *   - 每题答案分布（按题型分别聚合）
   */
  async getSurveyStats(surveyId: bigint): Promise<SurveyStatsResponse> {
    const surveyIdStr = bigIntToStr(surveyId);
    const cacheKey = `admin:stats:survey:${surveyIdStr}`;

    // 优先读缓存
    const cached = await this.cache.get<SurveyStatsResponse>(cacheKey);
    if (cached) return cached;

    // 校验问卷存在
    const survey = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, deleted_at: null },
      select: { id: true, title: true, status: true }
    });
    if (!survey) {
      throw new AppError("问卷不存在", 404);
    }

    const surveyTitle = survey.title;

    // 并行查询
    const [totalResponses, validResponses, components] = await Promise.all([
      this.fastify.prisma.response.count({ where: { survey_id: surveyId } }),
      this.fastify.prisma.response.count({ where: { survey_id: surveyId, status: 1 } }),
      // 仅统计题目组件（排除 text_note 展示型）
      this.fastify.prisma.surveyComponent.findMany({
        where: { survey_id: surveyId, type: { notIn: Array.from(NON_QUESTION_TYPES) } },
        orderBy: { order_index: "asc" },
        select: { id: true, type: true, config: true, order_index: true }
      }),
      // 全量组件（用于复原组件名）
      this.fastify.prisma.surveyComponent.findMany({
        where: { survey_id: surveyId },
        orderBy: { order_index: "asc" },
        select: { id: true, type: true, config: true, order_index: true }
      })
    ]);

    // 每日趋势
    const dailyTrend = await this.getSurveyDailyTrend(surveyId);

    // 逐题分析
    const questions: QuestionStats[] = [];

    for (const comp of components) {
      const componentId = bigIntToStr(comp.id);
      const compType = comp.type;
      const compConfig = comp.config as Record<string, unknown>;
      const compTitle = extractTitleFromConfig(compConfig) ?? TYPE_NAME_MAP[compType] ?? compType;

      const stat: QuestionStats = {
        component_id: componentId,
        type: compType,
        title: compTitle,
        order_index: comp.order_index,
        total_answers: 0
      };

      // 该题的答案总数
      const answerCount = await this.fastify.prisma.answer.count({
        where: { component_id: comp.id }
      });
      stat.total_answers = answerCount;

      if (answerCount === 0) {
        questions.push(stat);
        continue;
      }

      // 按题型分别处理
      if (JSON_ARRAY_TYPES.has(compType)) {
        // 多选 / 图片多选 / 排序 → 展开 JSON 数组聚合
        stat.options_distribution = await this.getJsonArrayDistribution(comp.id, compConfig, compType);
      } else if (NUMERIC_TYPES.has(compType)) {
        // 评分 / 滑块 → 数值聚合 + 分布
        const numStats = await this.getNumericStats(comp.id);
        stat.average = numStats.average;
        stat.min = numStats.min;
        stat.max = numStats.max;
        stat.options_distribution = await this.getNumericDistribution(comp.id, compConfig);
      } else if (TEXT_TYPES.has(compType) || compType.startsWith("personal-info-")) {
        // 文本 / 个人信息 → 抽样
        stat.sample_answers = await this.getTextSamples(comp.id);
      } else if (compType === "matrix_single") {
        // 矩阵单选 → 解析 JSON 统计
        stat.options_distribution = await this.getMatrixDistribution(comp.id, compConfig);
      } else {
        // 单选 / 下拉 / 图片单选 / 日期 / 级联 → GROUP BY value
        stat.options_distribution = await this.getSingleValueDistribution(comp.id, compConfig, compType);
      }

      questions.push(stat);
    }

    // 完成率
    const completionRate = totalResponses > 0 ? Math.round((validResponses / totalResponses) * 100 * 10) / 10 : 0;

    const result: SurveyStatsResponse = {
      survey_id: surveyIdStr,
      title: surveyTitle,
      total_responses: totalResponses,
      valid_responses: validResponses,
      completion_rate: completionRate,
      daily_trend: dailyTrend,
      questions
    };

    // 缓存统计结果
    await this.cache.set(cacheKey, result, CacheTTL.SURVEY);

    return result;
  }

  // ============================================================
  //  答卷列表（增强查询 — 含关键字搜索、日期筛选）
  // ============================================================

  /**
   * 查询问卷的答卷列表（管理员视角）
   *
   * 增强点：
   *   - keyword 模糊匹配匿名 ID 或答案内容
   *   - date_from / date_to 日期范围筛选
   *   - 返回的答案带组件上下文（类型+标题）
   */
  async listResponses(surveyId: bigint, query: AdminResponseListQueryInput): Promise<AdminResponseListResponse> {
    // 校验问卷存在
    const survey = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, deleted_at: null },
      select: { id: true }
    });
    if (!survey) {
      throw new AppError("问卷不存在", 404);
    }

    const { page, page_size, status, date_from, date_to, keyword } = query;

    // 构建查询条件
    const where: Record<string, unknown> = { survey_id: surveyId };
    if (status !== undefined) where.status = status;
    if (date_from || date_to) {
      const submittedAt: Record<string, Date> = {};
      if (date_from) submittedAt.gte = new Date(date_from);
      if (date_to) submittedAt.lte = new Date(date_to);
      where.submitted_at = submittedAt;
    }

    // 关键字搜索：匹配匿名 ID
    if (keyword) {
      where.OR = [{ anonymous_id: { contains: keyword } }];
    }

    // 并行查询答卷列表 + 总数
    const [items, total] = await Promise.all([
      this.fastify.prisma.response.findMany({
        where,
        select: {
          id: true,
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

    // 批量加载组件上下文（所有答卷共用一份组件映射）
    const allComponents = await this.fastify.prisma.surveyComponent.findMany({
      where: { survey_id: surveyId },
      select: { id: true, type: true, config: true }
    });
    const compMap = new Map<string, { type: string; title: string }>();
    for (const c of allComponents) {
      const cid = bigIntToStr(c.id);
      const cfg = c.config as Record<string, unknown>;
      const title = extractTitleFromConfig(cfg) ?? TYPE_NAME_MAP[c.type] ?? c.type;
      compMap.set(cid, { type: c.type, title });
    }

    // 批量加载所有相关答卷的答案
    const responseIds = (items as Array<{ id: bigint }>).map(r => r.id);
    const answerMap = new Map<string, Array<{ component_id: bigint; value: string | null; values: unknown }>>();

    if (responseIds.length > 0) {
      const allAnswers = await this.fastify.prisma.answer.findMany({
        where: { response_id: { in: responseIds } },
        select: { response_id: true, component_id: true, value: true, values: true }
      });

      for (const a of allAnswers) {
        const rid = bigIntToStr(a.response_id);
        if (!answerMap.has(rid)) answerMap.set(rid, []);
        answerMap.get(rid)!.push(a);
      }
    }

    // 组装响应
    const responses: AdminResponseItem[] = (
      items as Array<{
        id: bigint;
        anonymous_id: string | null;
        status: number;
        submitted_at: Date | null;
        created_at: Date;
      }>
    ).map(r => {
      const rid = bigIntToStr(r.id);
      const ansRows = answerMap.get(rid) ?? [];

      const answers: AnswerWithContext[] = ansRows.map(a => {
        const cid = bigIntToStr(a.component_id);
        const ctx = compMap.get(cid);
        const item: AnswerWithContext = {
          component_id: cid,
          component_type: ctx?.type ?? "unknown",
          component_title: ctx?.title ?? "未知题目"
        };
        if (a.value !== null && a.value !== undefined) {
          item.value = a.value;
        }
        if (a.values !== null && a.values !== undefined) {
          // values 是 PostgreSQL jsonb，Prisma 返回为已解析的数组
          item.values = a.values as string[];
        }
        return item;
      });

      return {
        id: rid,
        anonymous_id: r.anonymous_id,
        status: r.status as 0 | 1,
        submitted_at: r.submitted_at?.toISOString() ?? null,
        created_at: r.created_at.toISOString(),
        answers
      };
    });

    // 如果有关键词搜索，在应用层过滤答案内容
    let filteredResponses = responses;
    let filteredTotal = total;
    if (keyword && responseIds.length > 0) {
      const kw = keyword.toLowerCase();
      filteredResponses = responses.filter(
        r =>
          r.answers.some(
            a =>
              (a.value && a.value.toLowerCase().includes(kw)) ||
              (a.values && a.values.some(v => v.toLowerCase().includes(kw)))
          ) ||
          (r.anonymous_id && r.anonymous_id.toLowerCase().includes(kw))
      );
      // 精确计数因应用层过滤而不准确，使用最佳估算
      filteredTotal = filteredResponses.length;
    }

    return {
      responses: filteredResponses,
      total: filteredTotal,
      page,
      page_size
    };
  }

  // ============================================================
  //  CSV 导出
  // ============================================================

  /**
   * 导出问卷答卷为 CSV 格式
   *
   * CSV 结构：
   *   第 1 行：题目标题（带题型标注）
   *   后续行：每份答卷一行，每列一题答案
   */
  async exportResponsesCSV(surveyId: bigint, query: ExportQueryInput): Promise<string> {
    // 获取组件列表（按 order_index 排序），用作文本表头
    const components = await this.fastify.prisma.surveyComponent.findMany({
      where: { survey_id: surveyId, type: { notIn: Array.from(NON_QUESTION_TYPES) } },
      orderBy: { order_index: "asc" },
      select: { id: true, type: true, config: true, order_index: true }
    });

    // 构建查询条件
    const where: Record<string, unknown> = { survey_id: surveyId };
    if (query.date_from || query.date_to) {
      const submittedAt: Record<string, Date> = {};
      if (query.date_from) submittedAt.gte = new Date(query.date_from);
      if (query.date_to) submittedAt.lte = new Date(query.date_to);
      where.submitted_at = submittedAt;
    }

    // 获取答卷 ID 列表
    const responses = await this.fastify.prisma.response.findMany({
      where,
      select: { id: true, anonymous_id: true, submitted_at: true },
      orderBy: { created_at: "asc" }
    });

    if (responses.length === 0) {
      return "暂无答卷数据";
    }

    // 批量加载所有答案
    const responseIds = responses.map(r => r.id);
    const allAnswers = await this.fastify.prisma.answer.findMany({
      where: { response_id: { in: responseIds } },
      select: { response_id: true, component_id: true, value: true, values: true }
    });

    // 构建答案映射：responseId → { componentId → answer }
    const answerMap = new Map<string, Map<string, { value: string | null; values: string[] | null }>>();
    for (const a of allAnswers) {
      const rid = bigIntToStr(a.response_id);
      const cid = bigIntToStr(a.component_id);
      if (!answerMap.has(rid)) answerMap.set(rid, new Map());
      answerMap.get(rid)!.set(cid, {
        value: a.value,
        values: a.values as string[] | null
      });
    }

    // 构建 CSV
    const lines: string[] = [];

    // 表头：编号, 提交时间, 匿名ID, Q1_标题(类型), Q2_标题(类型), ...
    const headers = ["答卷编号", "提交时间", "匿名ID"];
    for (const comp of components) {
      const cfg = comp.config as Record<string, unknown>;
      const title = extractTitleFromConfig(cfg) ?? TYPE_NAME_MAP[comp.type] ?? comp.type;
      const typeLabel = TYPE_NAME_MAP[comp.type] ?? comp.type;
      headers.push(`${title}(${typeLabel})`);
    }
    lines.push(headers.map(h => csvEscape(h)).join(","));

    // 数据行
    for (const resp of responses) {
      const rid = bigIntToStr(resp.id);
      const row: string[] = [rid, resp.submitted_at?.toISOString() ?? "", csvEscape(resp.anonymous_id ?? "")];

      const respAnswers = answerMap.get(rid);

      for (const comp of components) {
        const cid = bigIntToStr(comp.id);
        const ans = respAnswers?.get(cid);
        let cellValue = "";
        if (ans) {
          if (ans.values && ans.values.length > 0) {
            // 多选：用分号连接
            cellValue = ans.values.map(v => csvEscape(v)).join(";");
          } else if (ans.value !== null && ans.value !== undefined) {
            cellValue = csvEscape(ans.value);
          }
        }
        row.push(cellValue);
      }

      lines.push(row.join(","));
    }

    return lines.join("\n");
  }

  // ════════════════════════════════════════════════════════════
  //  私有聚合方法
  // ════════════════════════════════════════════════════════════

  /** 每日答卷趋势（最近 N 天） */
  private async getDailyTrend(days: number): Promise<Array<{ date: string; count: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const raw = await this.fastify.prisma.$queryRawUnsafe<Array<{ date: string; count: bigint }>>(
      `SELECT DATE(submitted_at) as date, COUNT(*) as count
       FROM responses
       WHERE submitted_at >= $1
       GROUP BY DATE(submitted_at)
       ORDER BY date`,
      startDate
    );

    // 补全缺失的日期（填充 0）
    const result: Array<{ date: string; count: number }> = [];
    const dateMap = new Map<string, number>();
    for (const row of raw) {
      dateMap.set(row.date, Number(row.count));
    }
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      result.push({ date: dateStr, count: dateMap.get(dateStr) ?? 0 });
    }

    return result;
  }

  /** 单问卷每日答卷趋势 */
  private async getSurveyDailyTrend(surveyId: bigint): Promise<Array<{ date: string; count: number }>> {
    const raw = await this.fastify.prisma.$queryRawUnsafe<Array<{ date: string; count: bigint }>>(
      `SELECT DATE(submitted_at) as date, COUNT(*) as count
       FROM responses
       WHERE survey_id = $1 AND submitted_at IS NOT NULL
       GROUP BY DATE(submitted_at)
       ORDER BY date`,
      surveyId
    );

    return raw.map(r => ({ date: r.date, count: Number(r.count) }));
  }

  /** 单值聚合（单选/下拉/图片单选/日期/级联） */
  private async getSingleValueDistribution(
    componentId: bigint,
    config: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    compType: string
  ): Promise<OptionDistribution[]> {
    const raw = await this.fastify.prisma.answer.groupBy({
      by: ["value"],
      where: { component_id: componentId, value: { not: null } },
      _count: { value: true },
      orderBy: { _count: { value: "desc" } }
    });

    const total = raw.reduce((sum, r) => sum + r._count.value, 0);

    // 用 config 中的 options 还原选项标签
    const optionsMap = extractOptionLabels(config);

    return raw.map(r => {
      const val = r.value ?? "";
      const label = optionsMap.get(val) ?? val;
      return {
        label,
        count: r._count.value,
        percentage: total > 0 ? Math.round((r._count.value / total) * 1000) / 10 : 0
      };
    });
  }

  /** JSON 数组聚合（多选/图片多选/排序） */
  private async getJsonArrayDistribution(
    componentId: bigint,
    config: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    compType: string
  ): Promise<OptionDistribution[]> {
    const raw = await this.fastify.prisma.$queryRawUnsafe<Array<{ elem: string; count: bigint }>>(
      `SELECT elem, COUNT(*) as count
       FROM answers
       CROSS JOIN LATERAL jsonb_array_elements_text(values) AS elem
       WHERE component_id = $1 AND values IS NOT NULL
       GROUP BY elem
       ORDER BY count DESC`,
      componentId
    );

    const total = raw.reduce((sum, r) => sum + Number(r.count), 0);
    const optionsMap = extractOptionLabels(config);

    return raw.map(r => ({
      label: optionsMap.get(r.elem) ?? r.elem,
      count: Number(r.count),
      percentage: total > 0 ? Math.round((Number(r.count) / total) * 1000) / 10 : 0
    }));
  }

  /** 数值聚合（评分/滑块） */
  private async getNumericStats(componentId: bigint): Promise<{
    average: number;
    min: number;
    max: number;
  }> {
    const agg = await this.fastify.prisma.$queryRawUnsafe<
      Array<{
        avg: number | null;
        min: number | null;
        max: number | null;
      }>
    >(
      `SELECT
         AVG(value::numeric) as avg,
         MIN(value::numeric) as min,
         MAX(value::numeric) as max
       FROM answers
       WHERE component_id = $1 AND value IS NOT NULL AND value ~ '^[0-9]+(\\.[0-9]+)?$'`,
      componentId
    );

    const row = agg[0];
    return {
      average: row?.avg ? Math.round(Number(row.avg) * 10) / 10 : 0,
      min: row?.min ? Number(row.min) : 0,
      max: row?.max ? Number(row.max) : 0
    };
  }

  /** 数值分布（评分/滑块） */
  private async getNumericDistribution(
    componentId: bigint,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    config: Record<string, unknown>
  ): Promise<OptionDistribution[]> {
    const raw = await this.fastify.prisma.answer.groupBy({
      by: ["value"],
      where: { component_id: componentId, value: { not: null } },
      _count: { value: true },
      orderBy: { value: "asc" }
    });

    const total = raw.reduce((sum, r) => sum + r._count.value, 0);

    return raw.map(r => ({
      label: r.value ?? "",
      count: r._count.value,
      percentage: total > 0 ? Math.round((r._count.value / total) * 1000) / 10 : 0
    }));
  }

  /** 文本抽样 */
  private async getTextSamples(componentId: bigint): Promise<string[]> {
    const answers = await this.fastify.prisma.answer.findMany({
      where: { component_id: componentId, value: { not: null } },
      select: { value: true },
      take: 10,
      orderBy: { created_at: "desc" }
    });

    return answers.map(a => a.value!).filter(v => v.length > 0);
  }

  /** 矩阵单选聚合 */
  private async getMatrixDistribution(
    componentId: bigint,
    config: Record<string, unknown>
  ): Promise<OptionDistribution[]> {
    // 矩阵答案存在 value 字段，格式为 JSON string 如 '{"0":2,"1":0}'
    // 每个 key 是行索引，value 是列索引
    const answers = await this.fastify.prisma.answer.findMany({
      where: { component_id: componentId, value: { not: null } },
      select: { value: true }
    });

    const rowLabels = extractMatrixRowLabels(config);
    const colLabels = extractMatrixColLabels(config);

    // 按 (行标签, 列标签) 维度聚合
    const distMap = new Map<string, number>();

    for (const a of answers) {
      try {
        const parsed = JSON.parse(a.value!) as Record<string, number>;
        for (const [rowIdx, colIdx] of Object.entries(parsed)) {
          const rowLabel = rowLabels[Number(rowIdx)] ?? `行${Number(rowIdx) + 1}`;
          const colLabel = colLabels[Number(colIdx)] ?? `列${Number(colIdx) + 1}`;
          const key = `${rowLabel} → ${colLabel}`;
          distMap.set(key, (distMap.get(key) ?? 0) + 1);
        }
      } catch {
        // 忽略解析失败的记录
      }
    }

    // 总选择次数
    let total = 0;
    for (const count of distMap.values()) total += count;

    const result: OptionDistribution[] = [];
    for (const [key, count] of distMap) {
      result.push({
        label: key,
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
      });
    }

    return result.sort((a, b) => b.count - a.count);
  }
}

// ══════════════════════════════════════════════════════════════
//  Config 解析工具函数
// ══════════════════════════════════════════════════════════════

/**
 * 从组件的 config JSON 中提取题目标题
 *
 * config 结构（以单选题为例）：
 *   { title: { status: "您的满意度？" }, ... }
 */
function extractTitleFromConfig(config: Record<string, unknown>): string | null {
  const title = config["title"] as Record<string, unknown> | undefined;
  if (title && typeof title["status"] === "string" && title["status"].length > 0) {
    return title["status"] as string;
  }
  return null;
}

/**
 * 从组件的 config JSON 中提取选项标签映射
 *
 * 支持三种选项格式：
 *   1. StringStatusArr: ["选项A", "选项B"] → 索引→标签
 *   2. ValueStatusArr: [{ value: "A", status: "选项A" }] → value→标签
 *   3. PicTitleDescStatusArr: [{ picTitle: "图片1", picDesc: "...", value: "" }] → picTitle→标签
 */
function extractOptionLabels(config: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();

  const options = config["options"] as Record<string, unknown> | undefined;
  if (!options) return map;

  const status = options["status"] as Array<unknown> | undefined;
  if (!status || !Array.isArray(status) || status.length === 0) return map;

  const first = status[0] as Record<string, unknown> | undefined;

  if (first && "picTitle" in first) {
    // PicTitleDescStatusArr
    for (const item of status) {
      const i = item as Record<string, unknown>;
      const picTitle = String(i["picTitle"] ?? "");
      if (picTitle) map.set(picTitle, picTitle);
    }
  } else if (first && "value" in first && "status" in first) {
    // ValueStatusArr
    for (const item of status) {
      const i = item as Record<string, unknown>;
      const val = String(i["value"] ?? "");
      const label = String(i["status"] ?? val);
      if (val) map.set(val, label);
    }
  } else {
    // StringStatusArr（纯字符串数组）
    for (let idx = 0; idx < status.length; idx++) {
      const val = String(status[idx] ?? "");
      if (val) map.set(val, val);
    }
  }

  return map;
}

/** 提取矩阵行标签 */
function extractMatrixRowLabels(config: Record<string, unknown>): string[] {
  const matrixRows = config["matrixRows"] as Record<string, unknown> | undefined;
  if (!matrixRows) return [];
  const status = matrixRows["status"] as string[] | undefined;
  return status ?? [];
}

/** 提取矩阵列标签 */
function extractMatrixColLabels(config: Record<string, unknown>): string[] {
  const matrixColumns = config["matrixColumns"] as Record<string, unknown> | undefined;
  if (!matrixColumns) return [];
  const status = matrixColumns["status"] as string[] | undefined;
  return status ?? [];
}

/** CSV 字段转义（处理含逗号、引号、换行的字段） */
function csvEscape(value: string): string {
  if (!value.includes(",") && !value.includes('"') && !value.includes("\n")) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}
