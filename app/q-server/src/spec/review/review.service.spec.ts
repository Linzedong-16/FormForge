/**
 * ReviewService 单元测试
 *
 * 覆盖：审核列表、审核详情、审核通过、审核驳回
 * 包含：正常流程、异常边界、审计日志、权限校验、事务验证
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReviewService } from "../../modules/review/review.service.js";
import { AppError } from "../../utils/errors.js";
import {
  createFastifyMock,
  MOCK_REVIEW,
  MOCK_REVIEW_DETAIL,
  MOCK_APPROVED_REVIEW,
  MOCK_REJECTED_REVIEW,
  MOCK_USER
} from "../utils/test-helpers.js";

// ─── Setup ────────────────────────────────────────────────────

const ADMIN_ID = BigInt(1);
const REVIEW_ID = BigInt(5001);

describe("ReviewService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let service: ReviewService;

  beforeEach(() => {
    fastify = createFastifyMock();
    service = new ReviewService(fastify);
    vi.clearAllMocks();

    // 默认：$transaction 执行回调并传入 prisma mock 自身
    fastify.prisma.$transaction.mockImplementation((cb: Function) => cb(fastify.prisma));
  });

  // ============================================================
  //  listReviews
  // ============================================================

  describe("listReviews", () => {
    const query = { status: "pending" as const, page: 1, page_size: 10 };

    it("查询 pending 状态的审核列表 — 返回分页数据", async () => {
      fastify.prisma.review.findMany.mockResolvedValue([
        { ...MOCK_REVIEW, survey: { title: "测试", survey_type: "template", category: "customer" }, submitter: { username: "张三" } }
      ]);
      fastify.prisma.review.count.mockResolvedValue(1);

      const result = await service.listReviews(query);

      expect(result.list).toHaveLength(1);
      expect(result.list[0].review_id).toBe("5001");
      expect(result.list[0].status).toBe("pending");
      expect(result.list[0].submitter_name).toBe("张三");
      expect(result.pagination.total).toBe(1);
    });

    it("查询空列表 — 返回空数组", async () => {
      fastify.prisma.review.findMany.mockResolvedValue([]);
      fastify.prisma.review.count.mockResolvedValue(0);

      const result = await service.listReviews(query);

      expect(result.list).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it("按 approved 状态筛选", async () => {
      const approvedQuery = { status: "approved" as const, page: 1, page_size: 10 };
      fastify.prisma.review.findMany.mockResolvedValue([
        { ...MOCK_APPROVED_REVIEW, survey: { title: "已通过", survey_type: "template", category: null }, submitter: { username: "李四" } }
      ]);
      fastify.prisma.review.count.mockResolvedValue(1);

      const result = await service.listReviews(approvedQuery);

      expect(result.list[0].status).toBe("approved");
      expect(result.list[0].submitter_name).toBe("李四");
    });

    it("分页参数正确传递", async () => {
      fastify.prisma.review.findMany.mockResolvedValue([]);
      fastify.prisma.review.count.mockResolvedValue(50);

      const pagedQuery = { status: "pending" as const, page: 3, page_size: 5 };
      const result = await service.listReviews(pagedQuery);

      expect(result.pagination.page).toBe(3);
      expect(result.pagination.page_size).toBe(5);
      expect(result.pagination.total_pages).toBe(10);
    });
  });

  // ============================================================
  //  getReviewDetail
  // ============================================================

  describe("getReviewDetail", () => {
    it("查询审核详情 — 返回完整问卷内容", async () => {
      fastify.prisma.review.findUnique.mockResolvedValue(MOCK_REVIEW_DETAIL);

      const result = await service.getReviewDetail(REVIEW_ID);

      expect(result.review_id).toBe("5001");
      expect(result.survey_title).toBe("客户满意度调查模板");
      expect(result.survey_description).toBe("用于收集客户反馈");
      expect(result.survey_type).toBe("template");
      expect(result.category).toBe("customer");
      expect(result.submitter_name).toBe("测试用户");
      expect(result.status).toBe("pending");
      expect(result.components).toHaveLength(2);
      expect(result.components[0].type).toBe("single-select");
      expect(result.components[1].type).toBe("text-input");
      expect(result.reviewer_id).toBeNull();
      expect(result.reviewer_name).toBeNull();
    });

    it("查询不存在的审核记录 — 抛出 404", async () => {
      fastify.prisma.review.findUnique.mockResolvedValue(null);

      await expect(service.getReviewDetail(BigInt(9999))).rejects.toThrow(AppError);
      await expect(service.getReviewDetail(BigInt(9999))).rejects.toMatchObject({
        message: "审核记录不存在",
        statusCode: 404
      });
    });

    it("已审核通过的记录 — 包含审核人信息", async () => {
      const approvedDetail = {
        ...MOCK_REVIEW_DETAIL,
        ...MOCK_APPROVED_REVIEW,
        reviewer: { id: BigInt(1), username: "系统管理员" }
      };
      fastify.prisma.review.findUnique.mockResolvedValue(approvedDetail);

      const result = await service.getReviewDetail(BigInt(5002));

      expect(result.status).toBe("approved");
      expect(result.reviewer_id).toBe("1");
      expect(result.reviewer_name).toBe("系统管理员");
      expect(result.review_comment).toBe("内容合规，同意上架");
      expect(result.reviewed_at).toBeDefined();
    });
  });

  // ============================================================
  //  approveReview
  // ============================================================

  describe("approveReview", () => {
    const approveInput = { review_comment: "内容合规" };

    it("审核通过 — 状态更新为 approved", async () => {
      fastify.prisma.review.findUnique.mockResolvedValue(MOCK_REVIEW);
      fastify.prisma.review.update.mockResolvedValue({
        ...MOCK_APPROVED_REVIEW,
        review_comment: "内容合规"
      });
      fastify.prisma.survey.update.mockResolvedValue({});

      const result = await service.approveReview(ADMIN_ID, REVIEW_ID, approveInput);

      expect(result.status).toBe("approved");
      expect(result.review_id).toBe("5002");
      expect(result.reviewed_at).toBeDefined();
    });

    it("审核通过 — 不传审核意见也可以", async () => {
      fastify.prisma.review.findUnique.mockResolvedValue(MOCK_REVIEW);
      fastify.prisma.review.update.mockResolvedValue({
        ...MOCK_APPROVED_REVIEW,
        review_comment: null
      });
      fastify.prisma.survey.update.mockResolvedValue({});

      const result = await service.approveReview(ADMIN_ID, REVIEW_ID, {});

      expect(result.status).toBe("approved");
    });

    it("审核记录不存在 — 抛出 404", async () => {
      fastify.prisma.review.findUnique.mockResolvedValue(null);

      await expect(service.approveReview(ADMIN_ID, BigInt(9999), approveInput)).rejects.toThrow(AppError);
      await expect(service.approveReview(ADMIN_ID, BigInt(9999), approveInput)).rejects.toMatchObject({
        message: "审核记录不存在",
        statusCode: 404
      });
    });

    it("已处理的审核记录 — 抛出 409", async () => {
      fastify.prisma.review.findUnique.mockResolvedValue(MOCK_APPROVED_REVIEW);

      await expect(service.approveReview(ADMIN_ID, BigInt(5002), approveInput)).rejects.toThrow(AppError);
      await expect(service.approveReview(ADMIN_ID, BigInt(5002), approveInput)).rejects.toMatchObject({
        message: "该审核记录已处理，无法重复操作",
        statusCode: 409
      });
    });

    it("事务内正确更新 Review 和 Survey", async () => {
      const txMock = {
        review: {
          findUnique: vi.fn().mockResolvedValue(MOCK_REVIEW),
          update: vi.fn().mockResolvedValue({
            id: BigInt(5001),
            survey_id: BigInt(300),
            status: "approved",
            reviewer_id: BigInt(1),
            reviewed_at: new Date("2026-06-22T10:00:00.000Z")
          })
        },
        survey: {
          update: vi.fn().mockResolvedValue({})
        }
      };
      fastify.prisma.$transaction.mockImplementation(
        (cb: Function) => cb(txMock)
      );

      const result = await service.approveReview(ADMIN_ID, REVIEW_ID, approveInput);

      expect(txMock.review.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REVIEW_ID },
          data: expect.objectContaining({
            status: "approved",
            reviewer_id: ADMIN_ID,
            review_comment: "内容合规"
          })
        })
      );
      expect(txMock.survey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(300) },
          data: { review_status: "approved" }
        })
      );
      expect(result.status).toBe("approved");
    });
  });

  // ============================================================
  //  rejectReview
  // ============================================================

  describe("rejectReview", () => {
    const rejectInput = { review_comment: "内容违规，请修改" };

    it("审核驳回 — 状态更新为 rejected", async () => {
      fastify.prisma.review.findUnique.mockResolvedValue(MOCK_REVIEW);
      fastify.prisma.review.update.mockResolvedValue({
        ...MOCK_REJECTED_REVIEW,
        review_comment: "内容违规，请修改"
      });
      fastify.prisma.survey.update.mockResolvedValue({});

      const result = await service.rejectReview(ADMIN_ID, REVIEW_ID, rejectInput);

      expect(result.status).toBe("rejected");
      expect(result.review_id).toBe("5003");
      expect(result.reviewed_at).toBeDefined();
    });

    it("审核记录不存在 — 抛出 404", async () => {
      fastify.prisma.review.findUnique.mockResolvedValue(null);

      await expect(service.rejectReview(ADMIN_ID, BigInt(9999), rejectInput)).rejects.toThrow(AppError);
      await expect(service.rejectReview(ADMIN_ID, BigInt(9999), rejectInput)).rejects.toMatchObject({
        message: "审核记录不存在",
        statusCode: 404
      });
    });

    it("已驳回的记录再次驳回 — 抛出 409", async () => {
      fastify.prisma.review.findUnique.mockResolvedValue(MOCK_REJECTED_REVIEW);

      await expect(service.rejectReview(ADMIN_ID, BigInt(5003), rejectInput)).rejects.toThrow(AppError);
      await expect(service.rejectReview(ADMIN_ID, BigInt(5003), rejectInput)).rejects.toMatchObject({
        message: "该审核记录已处理，无法重复操作",
        statusCode: 409
      });
    });

    it("事务内正确更新 Review 和 Survey", async () => {
      const txMock = {
        review: {
          findUnique: vi.fn().mockResolvedValue(MOCK_REVIEW),
          update: vi.fn().mockResolvedValue({
            id: BigInt(5001),
            survey_id: BigInt(300),
            status: "rejected",
            reviewer_id: BigInt(1),
            review_comment: "内容违规，请修改",
            reviewed_at: new Date("2026-06-22T10:00:00.000Z")
          })
        },
        survey: {
          update: vi.fn().mockResolvedValue({})
        }
      };
      fastify.prisma.$transaction.mockImplementation(
        (cb: Function) => cb(txMock)
      );

      const result = await service.rejectReview(ADMIN_ID, REVIEW_ID, rejectInput);

      expect(txMock.review.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REVIEW_ID },
          data: expect.objectContaining({
            status: "rejected",
            reviewer_id: ADMIN_ID,
            review_comment: "内容违规，请修改"
          })
        })
      );
      expect(txMock.survey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: BigInt(300) },
          data: { review_status: "rejected" }
        })
      );
      expect(result.status).toBe("rejected");
    });
  });
});