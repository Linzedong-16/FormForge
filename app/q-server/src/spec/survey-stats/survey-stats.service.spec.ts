/**
 * SurveyStatsService 单元测试
 *
 * 覆盖：统计批量聚合（US1）、Promise.all 查询完整性（US2）、边缘情况
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SurveyStatsService } from "../../modules/survey/survey-stats/survey-stats.service.js";
import { createFastifyMock } from "../utils/test-helpers.js";

// ─── 模拟组件数据 ────────────────────────────────────────────────

/** 创建一个模拟的题目组件 */
function makeComponent(id: bigint, type: string, title: string, orderIdx: number, options?: string[]) {
  const config: Record<string, unknown> = {
    title: { status: title, isShow: true, name: "title-editor" },
  };
  if (options) {
    config.options = { status: options };
  }
  return { id, type, config, order_index: orderIdx };
}

// ─── Setup ────────────────────────────────────────────────────

describe("SurveyStatsService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let service: SurveyStatsService;

  beforeEach(() => {
    fastify = createFastifyMock();
    service = new SurveyStatsService(fastify);
    vi.clearAllMocks();

    // 默认：Redis 缓存全部 miss（getOrSet 走 factory）
    fastify.redis.get.mockResolvedValue(null);
    fastify.redis.scan.mockResolvedValue(["0", []]);

    // 默认：$queryRawUnsafe 返回空数组（getSurveyDailyTrend 等底层查询）
    fastify.prisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  // ============================================================
  //  US2 — Promise.all 查询完整性
  // ============================================================

  describe("getSurveyStats — Promise.all 查询完整性 (US2)", () => {
    it("getSurveyStats 发起的并行查询不包含未使用的第4个全量组件查询", async () => {
      fastify.prisma.survey.findFirst.mockResolvedValue({
        id: BigInt(1),
        title: "测试问卷",
        status: 1,
      });

      fastify.prisma.response.count.mockResolvedValue(100);

      const components = [
        makeComponent(BigInt(101), "single_select", "Q1", 0, ["A", "B"]),
        makeComponent(BigInt(102), "multi_select", "Q2", 1, ["X", "Y"]),
        makeComponent(BigInt(103), "rate_score", "Q3", 2),
      ];
      fastify.prisma.surveyComponent.findMany.mockResolvedValue(components);

      // 批量答案计数（覆盖 getSurveyDailyTrend 的默认 []）
      fastify.prisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // getSurveyDailyTrend
        .mockResolvedValueOnce([
          { component_id: BigInt(101), count: BigInt(50) },
          { component_id: BigInt(102), count: BigInt(30) },
          { component_id: BigInt(103), count: BigInt(20) },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(101), value: "A", count: BigInt(30) },
          { component_id: BigInt(101), value: "B", count: BigInt(20) },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(102), elem: "X", count: BigInt(25) },
          { component_id: BigInt(102), elem: "Y", count: BigInt(10) },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(103), avg: 3.5, min: 1, max: 5 },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(103), value: "3", count: BigInt(8) },
          { component_id: BigInt(103), value: "4", count: BigInt(7) },
          { component_id: BigInt(103), value: "5", count: BigInt(5) },
        ]);

      const result = await service.getSurveyStats(BigInt(1));

      expect(result.survey_id).toBe("1");
      expect(result.total_responses).toBe(100);
      expect(result.questions).toHaveLength(3);

      // 验证 findMany 仅被调用 1 次（题目组件），不含全量组件查询
      const findManyCalls = fastify.prisma.surveyComponent.findMany.mock.calls;
      expect(findManyCalls.length).toBe(1);
      const findManyWhere = findManyCalls[0]?.[0]?.where as Record<string, unknown> | undefined;
      expect(findManyWhere?.type).toBeDefined();
    });
  });

  // ============================================================
  //  US1 — 批量聚合正确性
  // ============================================================

  describe("getSurveyStats — 批量聚合正确性 (US1)", () => {
    it("单选题批量聚合：选项分布数据正确（标签映射、百分比计算）", async () => {
      fastify.prisma.survey.findFirst.mockResolvedValue({
        id: BigInt(1),
        title: "单选题测试",
        status: 1,
      });

      fastify.prisma.response.count.mockResolvedValue(100);

      const components = [
        makeComponent(BigInt(101), "single_select", "您的性别？", 0, ["男", "女"]),
      ];
      fastify.prisma.surveyComponent.findMany.mockResolvedValue(components);

      // 覆盖默认 mock：getSurveyDailyTrend → [], 答案计数 → counts, 单选分布 → dist
      fastify.prisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // getSurveyDailyTrend
        .mockResolvedValueOnce([
          { component_id: BigInt(101), count: BigInt(60) },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(101), value: "男", count: BigInt(35) },
          { component_id: BigInt(101), value: "女", count: BigInt(25) },
        ]);

      const result = await service.getSurveyStats(BigInt(1));

      expect(result.questions[0].total_answers).toBe(60);
      const dist = result.questions[0].options_distribution!;
      expect(dist).toHaveLength(2);
      // 选项标签从 StringStatusArr 按索引映射：0→"男", 1→"女"
      expect(dist[0].label).toBe("男");
      expect(dist[0].count).toBe(35);
      expect(dist[1].label).toBe("女");
      expect(dist[1].count).toBe(25);
    });

    it("多选题批量聚合：通过 jsonb_array_elements_text 展开后统计", async () => {
      fastify.prisma.survey.findFirst.mockResolvedValue({
        id: BigInt(1),
        title: "多选题测试",
        status: 1,
      });

      fastify.prisma.response.count.mockResolvedValue(50);

      const components = [
        makeComponent(BigInt(201), "multi_select", "兴趣爱好？", 0, ["读书", "运动", "音乐"]),
      ];
      fastify.prisma.surveyComponent.findMany.mockResolvedValue(components);

      fastify.prisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // getSurveyDailyTrend
        .mockResolvedValueOnce([
          { component_id: BigInt(201), count: BigInt(30) },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(201), elem: "读书", count: BigInt(20) },
          { component_id: BigInt(201), elem: "运动", count: BigInt(15) },
          { component_id: BigInt(201), elem: "音乐", count: BigInt(10) },
        ]);

      const result = await service.getSurveyStats(BigInt(1));

      expect(result.questions[0].total_answers).toBe(30);
      const dist = result.questions[0].options_distribution!;
      expect(dist).toHaveLength(3);
      expect(dist[0].label).toBe("读书");
      expect(dist[0].count).toBe(20);
    });

    it("评分题批量聚合：返回 avg/min/max 数值统计 + 分布", async () => {
      fastify.prisma.survey.findFirst.mockResolvedValue({
        id: BigInt(1),
        title: "评分题测试",
        status: 1,
      });

      fastify.prisma.response.count.mockResolvedValue(20);

      const components = [
        makeComponent(BigInt(301), "rate_score", "满意度评分", 0),
      ];
      fastify.prisma.surveyComponent.findMany.mockResolvedValue(components);

      fastify.prisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // getSurveyDailyTrend
        .mockResolvedValueOnce([
          { component_id: BigInt(301), count: BigInt(15) },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(301), avg: 4.2, min: 2, max: 5 },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(301), value: "2", count: BigInt(1) },
          { component_id: BigInt(301), value: "3", count: BigInt(2) },
          { component_id: BigInt(301), value: "4", count: BigInt(5) },
          { component_id: BigInt(301), value: "5", count: BigInt(7) },
        ]);

      const result = await service.getSurveyStats(BigInt(1));

      expect(result.questions[0].total_answers).toBe(15);
      expect(result.questions[0].average).toBe(4.2);
      expect(result.questions[0].min).toBe(2);
      expect(result.questions[0].max).toBe(5);
      const dist = result.questions[0].options_distribution!;
      expect(dist).toHaveLength(4);
    });

    it("混合题型：一次查询覆盖所有题目类型", async () => {
      fastify.prisma.survey.findFirst.mockResolvedValue({
        id: BigInt(1),
        title: "混合问卷",
        status: 1,
      });

      fastify.prisma.response.count.mockResolvedValue(200);

      const components = [
        makeComponent(BigInt(401), "single_select", "单选", 0, ["A1", "A2"]),
        makeComponent(BigInt(402), "multi_select", "多选", 1, ["B1", "B2"]),
        makeComponent(BigInt(403), "rate_score", "评分", 2),
        makeComponent(BigInt(404), "slider", "滑块", 3),
        makeComponent(BigInt(405), "option_select", "下拉", 4, ["C1", "C2", "C3"]),
      ];
      fastify.prisma.surveyComponent.findMany.mockResolvedValue(components);

      fastify.prisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // getSurveyDailyTrend
        .mockResolvedValueOnce([
          { component_id: BigInt(401), count: BigInt(80) },
          { component_id: BigInt(402), count: BigInt(60) },
          { component_id: BigInt(403), count: BigInt(40) },
          { component_id: BigInt(404), count: BigInt(30) },
          { component_id: BigInt(405), count: BigInt(70) },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(401), value: "A1", count: BigInt(50) },
          { component_id: BigInt(401), value: "A2", count: BigInt(30) },
          { component_id: BigInt(405), value: "C1", count: BigInt(25) },
          { component_id: BigInt(405), value: "C2", count: BigInt(25) },
          { component_id: BigInt(405), value: "C3", count: BigInt(20) },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(402), elem: "B1", count: BigInt(35) },
          { component_id: BigInt(402), elem: "B2", count: BigInt(25) },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(403), avg: 3.8, min: 1, max: 5 },
          { component_id: BigInt(404), avg: 60.5, min: 0, max: 100 },
        ])
        .mockResolvedValueOnce([
          { component_id: BigInt(403), value: "3", count: BigInt(10) },
          { component_id: BigInt(403), value: "4", count: BigInt(20) },
          { component_id: BigInt(403), value: "5", count: BigInt(10) },
          { component_id: BigInt(404), value: "50", count: BigInt(10) },
          { component_id: BigInt(404), value: "75", count: BigInt(15) },
          { component_id: BigInt(404), value: "100", count: BigInt(5) },
        ]);

      const result = await service.getSurveyStats(BigInt(1));

      expect(result.questions).toHaveLength(5);

      expect(result.questions[0].total_answers).toBe(80);
      expect(result.questions[0].options_distribution).toHaveLength(2);

      expect(result.questions[1].total_answers).toBe(60);
      expect(result.questions[1].options_distribution).toHaveLength(2);

      expect(result.questions[2].total_answers).toBe(40);
      expect(result.questions[2].average).toBe(3.8);

      expect(result.questions[3].total_answers).toBe(30);
      expect(result.questions[3].average).toBe(60.5);

      expect(result.questions[4].total_answers).toBe(70);
      expect(result.questions[4].options_distribution).toHaveLength(3);

      // $queryRawUnsafe 调用次数：trend + 计数 + 单值分布 + 多选分布 + 数值聚合 + 数值分布 = 6
      expect(fastify.prisma.$queryRawUnsafe).toHaveBeenCalledTimes(6);
    });
  });

  // ============================================================
  //  边缘情况 (Edge Cases)
  // ============================================================

  describe("getSurveyStats — 边缘情况", () => {
    it("全部 text_note 组件时返回空 questions 数组", async () => {
      fastify.prisma.survey.findFirst.mockResolvedValue({
        id: BigInt(1),
        title: "纯说明问卷",
        status: 1,
      });

      fastify.prisma.response.count.mockResolvedValue(5);

      // 所有组件都是 text_note，被 notIn 过滤后为空
      fastify.prisma.surveyComponent.findMany.mockResolvedValue([]);

      const result = await service.getSurveyStats(BigInt(1));

      expect(result.questions).toEqual([]);
      expect(result.total_responses).toBe(5);
      // 无组件时不应调用 $queryRawUnsafe（buildQuestionStats 短路返回）
    });

    it("零答卷：每题 total_answers=0，无分布数据", async () => {
      fastify.prisma.survey.findFirst.mockResolvedValue({
        id: BigInt(1),
        title: "无答卷问卷",
        status: 1,
      });

      fastify.prisma.response.count.mockResolvedValue(0);

      const components = [
        makeComponent(BigInt(501), "single_select", "Q1", 0, ["A", "B"]),
      ];
      fastify.prisma.surveyComponent.findMany.mockResolvedValue(components);

      // getSurveyDailyTrend → [], 答案计数 → 空
      fastify.prisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // getSurveyDailyTrend
        .mockResolvedValueOnce([]); // batchAnswerCounts

      const result = await service.getSurveyStats(BigInt(1));

      expect(result.total_responses).toBe(0);
      expect(result.questions[0].total_answers).toBe(0);
      // 零答案时不应有分布数据
      expect(result.questions[0].options_distribution).toBeUndefined();
    });

    it("问卷不存在时抛出 AppError", async () => {
      fastify.prisma.survey.findFirst.mockResolvedValue(null);

      await expect(service.getSurveyStats(BigInt(999))).rejects.toThrow("问卷不存在");
    });
  });
});
