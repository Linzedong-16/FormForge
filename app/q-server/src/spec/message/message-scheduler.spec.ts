/**
 * message-scheduler 单元测试
 *
 * 覆盖：消息清理（分批删除、未读消息不受影响）、问卷即将过期提醒扫描（幂等去重）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { __internal } from "../../modules/message/message-scheduler.js";
import { createFastifyMock } from "../utils/test-helpers.js";

const { runMessageCleanup, runExpiringSoonScan } = __internal;

describe("message-scheduler", () => {
  let fastify: ReturnType<typeof createFastifyMock>;

  beforeEach(() => {
    fastify = createFastifyMock();
    vi.clearAllMocks();
  });

  describe("runMessageCleanup", () => {
    it("分批删除已读过期消息，返回清理数量", async () => {
      fastify.prisma.message.findMany
        .mockResolvedValueOnce([{ id: BigInt(1) }, { id: BigInt(2) }])
        .mockResolvedValue([]);
      fastify.prisma.message.deleteMany.mockResolvedValue({ count: 2 });

      const result = await runMessageCleanup(fastify);

      expect(result.cleaned_read).toBeGreaterThanOrEqual(2);
      expect(fastify.prisma.message.deleteMany).toHaveBeenCalled();
    });

    it("查询条件排除未读消息（is_read: true）", async () => {
      fastify.prisma.message.findMany.mockResolvedValue([]);

      await runMessageCleanup(fastify);

      const calls = fastify.prisma.message.findMany.mock.calls;
      const readOnlyCalls = calls.filter(
        ([args]: [{ where: { is_read?: boolean } }]) => args.where.is_read !== undefined
      );
      expect(readOnlyCalls.every(([args]: [{ where: { is_read?: boolean } }]) => args.where.is_read === true)).toBe(
        true
      );
    });

    it("无待清理消息时返回 0，不报错", async () => {
      fastify.prisma.message.findMany.mockResolvedValue([]);

      const result = await runMessageCleanup(fastify);

      expect(result.cleaned_read).toBe(0);
      expect(result.cleaned_deleted).toBe(0);
      expect(fastify.prisma.message.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("runExpiringSoonScan", () => {
    it("扫描 7 天内到期且未提醒过的问卷，触发通知并回写 expiring_reminder_sent_at", async () => {
      const survey = {
        id: BigInt(100),
        user_id: BigInt(2),
        title: "测试问卷",
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      };
      fastify.prisma.survey.findMany.mockResolvedValue([survey]);
      fastify.prisma.survey.update.mockResolvedValue({});

      const result = await runExpiringSoonScan(fastify);

      expect(result.notified).toBe(1);
      expect(fastify.prisma.survey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: survey.id },
          data: expect.objectContaining({ expiring_reminder_sent_at: expect.any(Date) })
        })
      );
    });

    it("查询条件排除已提醒过的问卷（expiring_reminder_sent_at: null）", async () => {
      fastify.prisma.survey.findMany.mockResolvedValue([]);

      await runExpiringSoonScan(fastify);

      expect(fastify.prisma.survey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ expiring_reminder_sent_at: null }) })
      );
    });

    it("单条问卷通知失败不影响其他问卷的处理", async () => {
      const surveyA = { id: BigInt(100), user_id: BigInt(2), title: "问卷A", deadline: new Date() };
      const surveyB = { id: BigInt(101), user_id: BigInt(3), title: "问卷B", deadline: new Date() };
      fastify.prisma.survey.findMany.mockResolvedValue([surveyA, surveyB]);
      fastify.prisma.survey.update.mockRejectedValueOnce(new Error("DB 错误")).mockResolvedValueOnce({});

      const result = await runExpiringSoonScan(fastify);

      expect(result.notified).toBe(1);
      expect(fastify.log.warn).toHaveBeenCalled();
    });
  });
});
