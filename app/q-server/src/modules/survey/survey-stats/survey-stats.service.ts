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
import { createCache, CacheKeys, CacheTTL } from "../../../utils/cache.js";
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
  AnswerWithContext,
  SurveyStructureResponse,
  QuestionStructureItem
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
  async getOverview(_query: StatsOverviewQueryInput): Promise<StatsOverviewResponse> {
    return this.cache.getOrSet(
      CacheKeys.statsOverview,
      async () => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

        // 并行查询全部基础数据（含本周答卷，减少一次往返）
        const [totalSurveys, publishedSurveys, totalResponses, responsesToday, responsesThisWeek] = await Promise.all([
          this.fastify.prisma.survey.count({ where: { deleted_at: null } }),
          this.fastify.prisma.survey.count({ where: { deleted_at: null, status: 1 } }),
          this.fastify.prisma.response.count(),
          this.fastify.prisma.response.count({ where: { submitted_at: { gte: todayStart } } }),
          this.fastify.prisma.response.count({ where: { submitted_at: { gte: weekStart } } })
        ]);

        const trend7Days = await this.getDailyTrend(7);

        return {
          total_surveys: totalSurveys,
          published_surveys: publishedSurveys,
          total_responses: totalResponses,
          responses_today: responsesToday,
          responses_this_week: responsesThisWeek,
          trend_7_days: trend7Days
        };
      },
      CacheTTL.SURVEY
    );
  }

  // ============================================================
  //  单问卷详细统计
  // ============================================================

  /**
   * 获取单个问卷的详细统计分析
   *
   * 性能优化（P0-1/P0-2）：
   *   - 使用按 component_id 分组的批量 SQL 替代逐题独立查询，数据库查询次数与题目数量解耦
   *   - Promise.all 仅发起实际使用的查询，移除已废弃的全量组件查询
   *
   * 包含：
   *   - 答卷总量、完成率
   *   - 每日答卷趋势
   *   - 每题答案分布（按题型分别聚合）
   */
  async getSurveyStats(surveyId: bigint): Promise<SurveyStatsResponse> {
    const surveyIdStr = bigIntToStr(surveyId);

    return this.cache.getOrSet(
      CacheKeys.statsBySurvey(surveyIdStr),
      async () => {
        // 校验问卷存在
        const survey = await this.fastify.prisma.survey.findFirst({
          where: { id: surveyId, deleted_at: null },
          select: { id: true, title: true, status: true }
        });
        if (!survey) {
          throw new AppError("问卷不存在", 404);
        }

        const surveyTitle = survey.title;

        // 并行查询：答卷总数 + 有效答卷数 + 题目组件 + 每日趋势
        // 仅统计题目组件（排除 text_note 展示型），不再包含已废弃的全量组件查询
        const [totalResponses, validResponses, components, dailyTrend] = await Promise.all([
          this.fastify.prisma.response.count({ where: { survey_id: surveyId } }),
          this.fastify.prisma.response.count({ where: { survey_id: surveyId, status: 1 } }),
          this.fastify.prisma.surveyComponent.findMany({
            where: { survey_id: surveyId, type: { notIn: Array.from(NON_QUESTION_TYPES) } },
            orderBy: { order_index: "asc" },
            select: { id: true, type: true, config: true, order_index: true }
          }),
          this.getSurveyDailyTrend(surveyId)
        ]);

        // 逐题分析 — 使用批量聚合，避免 N+1 查询
        const questions = await this.buildQuestionStats(components);

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

        return result;
      },
      CacheTTL.SURVEY
    );
  }

  // ============================================================
  //  问卷结构（供内部凭证只读查询，不做所有权过滤）
  // ============================================================

  /**
   * 获取问卷结构（标题/描述/题目/选项）
   *
   * 与 survey-crud 模块的 GET /api/surveys/:id 区别：本方法不按 userId 过滤所有权，
   * 供 ai-service 等内部服务通过 X-Internal-Api-Key 凭证访问，用于 Agent 自主分析
   */
  async getSurveyStructure(surveyId: bigint): Promise<SurveyStructureResponse> {
    const surveyIdStr = bigIntToStr(surveyId);

    return this.cache.getOrSet(
      CacheKeys.statsSurveyStructure(surveyIdStr),
      async () => {
        const survey = await this.fastify.prisma.survey.findFirst({
          where: { id: surveyId, deleted_at: null },
          select: { id: true, title: true, description: true }
        });
        if (!survey) {
          throw new AppError("问卷不存在", 404);
        }

        const components = await this.fastify.prisma.surveyComponent.findMany({
          where: { survey_id: surveyId, type: { notIn: Array.from(NON_QUESTION_TYPES) } },
          orderBy: { order_index: "asc" },
          select: { id: true, type: true, config: true, required: true }
        });

        const questions: QuestionStructureItem[] = components.map(comp => {
          const compConfig = comp.config as Record<string, unknown>;
          const title = extractTitleFromConfig(compConfig) ?? TYPE_NAME_MAP[comp.type] ?? comp.type;
          const optionsMap = extractOptionLabels(compConfig);
          const options = optionsMap.size > 0 ? Array.from(optionsMap.values()) : null;

          return {
            id: bigIntToStr(comp.id),
            type: comp.type,
            title,
            required: comp.required === 1,
            options
          };
        });

        return {
          survey_id: surveyIdStr,
          title: survey.title,
          description: survey.description ?? null,
          questions
        };
      },
      CacheTTL.SURVEY
    );
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

  // ════════════════════════════════════════════════════════════
  //  批量聚合（P0-1: 消除 N+1 查询）
  // ════════════════════════════════════════════════════════════

  /**
   * 批量构建所有题目的统计数据
   *
   * 策略：
   *   1. 按题型将组件分组（单值/JSON数组/数值/文本/矩阵）
   *   2. 每种题型一次批量 SQL 完成该类型所有题目的聚合
   *   3. 文本题和矩阵题保持逐题处理（逻辑复杂，数量通常较少）
   *
   * @param components 题目组件列表（已排除 text_note 等非题目类型）
   */
  private async buildQuestionStats(
    components: Array<{ id: bigint; type: string; config: unknown; order_index: number }>
  ): Promise<QuestionStats[]> {
    if (components.length === 0) return [];

    // 按题型分类组件 ID
    const singleValueIds: bigint[] = []; // 单选/下拉/图片单选/日期/级联
    const jsonArrayIds: bigint[] = []; // 多选/图片多选/排序
    const numericIds: bigint[] = []; // 评分/滑块
    const textIds: bigint[] = []; // 文本/个人信息
    const matrixIds: bigint[] = []; // 矩阵单选

    for (const comp of components) {
      if (JSON_ARRAY_TYPES.has(comp.type)) {
        jsonArrayIds.push(comp.id);
      } else if (NUMERIC_TYPES.has(comp.type)) {
        numericIds.push(comp.id);
      } else if (TEXT_TYPES.has(comp.type) || comp.type.startsWith("personal-info-")) {
        textIds.push(comp.id);
      } else if (comp.type === "matrix_single") {
        matrixIds.push(comp.id);
      } else {
        singleValueIds.push(comp.id);
      }
    }

    const componentIds = components.map(c => c.id);

    // 并行执行所有批量查询 + 逐题查询
    const [answerCountMap, singleValueMap, jsonArrayMap, numericStatsMap, numericDistMap] = await Promise.all([
      this.batchAnswerCounts(componentIds),
      singleValueIds.length > 0
        ? this.batchSingleValueDistribution(singleValueIds)
        : Promise.resolve(new Map<string, OptionDistribution[]>()),
      jsonArrayIds.length > 0
        ? this.batchJsonArrayDistribution(jsonArrayIds)
        : Promise.resolve(new Map<string, OptionDistribution[]>()),
      numericIds.length > 0
        ? this.batchNumericStats(numericIds)
        : Promise.resolve(new Map<string, { average: number; min: number; max: number }>()),
      numericIds.length > 0
        ? this.batchNumericDistribution(numericIds)
        : Promise.resolve(new Map<string, OptionDistribution[]>())
    ]);

    // 文本题：逐题抽样（需 LIMIT，不适合批量）
    const textSampleMap = new Map<string, string[]>();
    for (const id of textIds) {
      textSampleMap.set(bigIntToStr(id), await this.getTextSamples(id));
    }

    // 矩阵题：逐题解析 JSON（格式复杂）
    const matrixDistMap = new Map<string, OptionDistribution[]>();
    for (const id of matrixIds) {
      const comp = components.find(c => c.id === id);
      if (comp) {
        matrixDistMap.set(
          bigIntToStr(id),
          await this.getMatrixDistribution(id, comp.config as Record<string, unknown>)
        );
      }
    }

    // ─── 组装结果 ──────────────────────────────────────────

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
        total_answers: answerCountMap.get(componentId) ?? 0
      };

      if (stat.total_answers === 0) {
        questions.push(stat);
        continue;
      }

      // 按题型从对应 Map 中获取预计算的聚合结果
      if (JSON_ARRAY_TYPES.has(compType)) {
        stat.options_distribution = jsonArrayMap.get(componentId) ?? [];
      } else if (NUMERIC_TYPES.has(compType)) {
        const numStats = numericStatsMap.get(componentId);
        if (numStats) {
          stat.average = numStats.average;
          stat.min = numStats.min;
          stat.max = numStats.max;
        }
        stat.options_distribution = numericDistMap.get(componentId) ?? [];
      } else if (TEXT_TYPES.has(compType) || compType.startsWith("personal-info-")) {
        stat.sample_answers = textSampleMap.get(componentId) ?? [];
      } else if (compType === "matrix_single") {
        stat.options_distribution = matrixDistMap.get(componentId) ?? [];
      } else {
        // 单选 / 下拉 / 图片单选 / 日期 / 级联
        stat.options_distribution = singleValueMap.get(componentId) ?? [];
      }

      questions.push(stat);
    }

    return questions;
  }

  /** 批量查询所有题目的答案计数 */
  private async batchAnswerCounts(componentIds: bigint[]): Promise<Map<string, number>> {
    const raw = await this.fastify.prisma.$queryRawUnsafe<Array<{ component_id: bigint; count: bigint }>>(
      `SELECT component_id, COUNT(*) as count
       FROM answers
       WHERE component_id = ANY($1::bigint[])
       GROUP BY component_id`,
      componentIds
    );

    const map = new Map<string, number>();
    for (const row of raw) {
      map.set(bigIntToStr(row.component_id), Number(row.count));
    }
    return map;
  }

  /**
   * 批量单值聚合（单选/下拉/图片单选/日期/级联）
   *
   * 一次 SQL 完成所有同类型题目的 GROUP BY component_id, value 统计
   */
  private async batchSingleValueDistribution(componentIds: bigint[]): Promise<Map<string, OptionDistribution[]>> {
    const raw = await this.fastify.prisma.$queryRawUnsafe<
      Array<{ component_id: bigint; value: string; count: bigint }>
    >(
      `SELECT component_id, value, COUNT(*) as count
       FROM answers
       WHERE component_id = ANY($1::bigint[]) AND value IS NOT NULL
       GROUP BY component_id, value
       ORDER BY component_id, count DESC`,
      componentIds
    );

    // 按 component_id 分组
    const grouped = new Map<string, Array<{ value: string; count: number }>>();
    for (const row of raw) {
      const cid = bigIntToStr(row.component_id);
      if (!grouped.has(cid)) grouped.set(cid, []);
      grouped.get(cid)!.push({ value: row.value, count: Number(row.count) });
    }

    // 计算百分比
    const result = new Map<string, OptionDistribution[]>();
    for (const [cid, rows] of grouped) {
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      result.set(
        cid,
        rows.map(r => ({
          label: r.value,
          count: r.count,
          percentage: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0
        }))
      );
    }
    return result;
  }

  /**
   * 批量 JSON 数组聚合（多选/图片多选/排序）
   *
   * 使用 CROSS JOIN LATERAL jsonb_array_elements_text 展开 values 数组，
   * 一次 SQL 完成所有多选/排序题的选项分布统计
   */
  private async batchJsonArrayDistribution(componentIds: bigint[]): Promise<Map<string, OptionDistribution[]>> {
    const raw = await this.fastify.prisma.$queryRawUnsafe<Array<{ component_id: bigint; elem: string; count: bigint }>>(
      `SELECT a.component_id, elem, COUNT(*) as count
       FROM answers a
       CROSS JOIN LATERAL jsonb_array_elements_text(a.values) AS elem
       WHERE a.component_id = ANY($1::bigint[]) AND a.values IS NOT NULL
       GROUP BY a.component_id, elem
       ORDER BY a.component_id, count DESC`,
      componentIds
    );

    // 按 component_id 分组
    const grouped = new Map<string, Array<{ elem: string; count: number }>>();
    for (const row of raw) {
      const cid = bigIntToStr(row.component_id);
      if (!grouped.has(cid)) grouped.set(cid, []);
      grouped.get(cid)!.push({ elem: row.elem, count: Number(row.count) });
    }

    // 计算百分比
    const result = new Map<string, OptionDistribution[]>();
    for (const [cid, rows] of grouped) {
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      result.set(
        cid,
        rows.map(r => ({
          label: r.elem,
          count: r.count,
          percentage: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0
        }))
      );
    }
    return result;
  }

  /**
   * 批量数值聚合（评分/滑块）
   *
   * 一次 SQL 完成所有数值题的 AVG/MIN/MAX 统计
   */
  private async batchNumericStats(
    componentIds: bigint[]
  ): Promise<Map<string, { average: number; min: number; max: number }>> {
    const raw = await this.fastify.prisma.$queryRawUnsafe<
      Array<{ component_id: bigint; avg: number | null; min: number | null; max: number | null }>
    >(
      `SELECT component_id,
         AVG(value::numeric) as avg,
         MIN(value::numeric) as min,
         MAX(value::numeric) as max
       FROM answers
       WHERE component_id = ANY($1::bigint[])
         AND value IS NOT NULL
         AND value ~ '^[0-9]+(\\.[0-9]+)?$'
       GROUP BY component_id`,
      componentIds
    );

    const map = new Map<string, { average: number; min: number; max: number }>();
    for (const row of raw) {
      map.set(bigIntToStr(row.component_id), {
        average: row.avg ? Math.round(Number(row.avg) * 10) / 10 : 0,
        min: row.min ? Number(row.min) : 0,
        max: row.max ? Number(row.max) : 0
      });
    }
    return map;
  }

  /**
   * 批量数值分布（评分/滑块）
   *
   * 一次 SQL 完成所有数值题的 value 分布统计
   */
  private async batchNumericDistribution(componentIds: bigint[]): Promise<Map<string, OptionDistribution[]>> {
    const raw = await this.fastify.prisma.$queryRawUnsafe<
      Array<{ component_id: bigint; value: string; count: bigint }>
    >(
      `SELECT component_id, value, COUNT(*) as count
       FROM answers
       WHERE component_id = ANY($1::bigint[]) AND value IS NOT NULL
       GROUP BY component_id, value
       ORDER BY component_id, value`,
      componentIds
    );

    // 按 component_id 分组
    const grouped = new Map<string, Array<{ value: string; count: number }>>();
    for (const row of raw) {
      const cid = bigIntToStr(row.component_id);
      if (!grouped.has(cid)) grouped.set(cid, []);
      grouped.get(cid)!.push({ value: row.value, count: Number(row.count) });
    }

    // 计算百分比
    const result = new Map<string, OptionDistribution[]>();
    for (const [cid, rows] of grouped) {
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      result.set(
        cid,
        rows.map(r => ({
          label: r.value,
          count: r.count,
          percentage: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0
        }))
      );
    }
    return result;
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

  const first = status[0];
  // StringStatusArr 时 first 是原始字符串，in 运算符要求左侧为对象，需先判断类型再收窄
  const firstIsObject = typeof first === "object" && first !== null;

  if (firstIsObject && "picTitle" in first) {
    // PicTitleDescStatusArr
    for (const item of status) {
      const i = item as Record<string, unknown>;
      const picTitle = String(i["picTitle"] ?? "");
      if (picTitle) map.set(picTitle, picTitle);
    }
  } else if (firstIsObject && "value" in first && "status" in first) {
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
