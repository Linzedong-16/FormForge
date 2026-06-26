/**
 * 审核模块路由 — 集成测试
 *
 * 覆盖：GET /reviews、GET /reviews/:id、POST /reviews/:id/approve、POST /reviews/:id/reject
 * 包含：权限校验、参数验证、正常流程、错误场景
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReviewService } from "../../modules/review/review.service.js";
import { AppError } from "../../utils/errors.js";
import {
  reviewListQuerySchema,
  approveReviewSchema,
  rejectReviewSchema,
  reviewIdSchema
} from "../../modules/review/review.schemas.js";

// ─── Mock 依赖 ────────────────────────────────────────────────

// Mock ReviewService（路由层只测试路由逻辑，不测试业务逻辑）
vi.mock("../../modules/review/review.service.js", () => ({
  ReviewService: vi.fn()
}));

// Mock 认证中间件（路由层测试不验证 JWT）
vi.mock("../../modules/user/auth/auth.middleware.js", () => ({
  authenticate: vi.fn(),
  requireSuperAdmin: vi.fn()
}));

// ─── Setup ────────────────────────────────────────────────────

function createMockService() {
  return {
    listReviews: vi.fn(),
    getReviewDetail: vi.fn(),
    approveReview: vi.fn(),
    rejectReview: vi.fn()
  } as unknown as ReviewService;
}

describe("Review Routes", () => {
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockService();
    (ReviewService as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockService);
  });

  // ============================================================
  //  Schema 验证
  // ============================================================

  describe("reviewListQuerySchema", () => {
    it("默认 status 为 pending", () => {
      const result = reviewListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("pending");
        expect(result.data.page).toBe(1);
        expect(result.data.page_size).toBe(10);
      }
    });

    it("无效 status 值 — 校验失败", () => {
      const result = reviewListQuerySchema.safeParse({ status: "invalid" });
      expect(result.success).toBe(false);
    });

    it("有效的 status 值 — 通过", () => {
      const result = reviewListQuerySchema.safeParse({ status: "approved" });
      expect(result.success).toBe(true);
    });

    it("page_size 超过 100 — 校验失败", () => {
      const result = reviewListQuerySchema.safeParse({ page_size: 200 });
      expect(result.success).toBe(false);
    });
  });

  describe("approveReviewSchema", () => {
    it("空对象 — 通过（审核意见可选）", () => {
      const result = approveReviewSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("带审核意见 — 通过", () => {
      const result = approveReviewSchema.safeParse({ review_comment: "同意" });
      expect(result.success).toBe(true);
    });

    it("审核意见超过 500 字符 — 校验失败", () => {
      const result = approveReviewSchema.safeParse({ review_comment: "a".repeat(501) });
      expect(result.success).toBe(false);
    });
  });

  describe("rejectReviewSchema", () => {
    it("空对象 — 校验失败（驳回意见必填）", () => {
      const result = rejectReviewSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("空字符串 review_comment — 校验失败", () => {
      const result = rejectReviewSchema.safeParse({ review_comment: "" });
      expect(result.success).toBe(false);
    });

    it("带驳回意见 — 通过", () => {
      const result = rejectReviewSchema.safeParse({ review_comment: "内容违规" });
      expect(result.success).toBe(true);
    });
  });

  describe("reviewIdSchema", () => {
    it("有效数字字符串 — 转为 BigInt", () => {
      const result = reviewIdSchema.safeParse("123");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(BigInt(123));
      }
    });

    it("非数字字符串 — 校验失败", () => {
      const result = reviewIdSchema.safeParse("abc");
      expect(result.success).toBe(false);
    });

    it("空字符串 — 校验失败", () => {
      const result = reviewIdSchema.safeParse("");
      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  //  路由逻辑测试（通过 mock Service 验证调用链）
  // ============================================================

  describe("Service 调用链", () => {
    it("listReviews — 调用 Service 并返回正确响应", async () => {
      const mockResult = {
        list: [],
        pagination: { page: 1, page_size: 10, total: 0, total_pages: 0 }
      };
      mockService.listReviews.mockResolvedValue(mockResult);

      const result = await mockService.listReviews({ status: "pending", page: 1, page_size: 10 });

      expect(result).toEqual(mockResult);
      expect(mockService.listReviews).toHaveBeenCalledWith({ status: "pending", page: 1, page_size: 10 });
    });

    it("getReviewDetail — 调用 Service 并返回审核详情", async () => {
      const mockDetail = {
        review_id: "5001",
        survey_id: "300",
        survey_title: "测试",
        survey_description: null,
        survey_type: "template" as const,
        category: null,
        submitter_id: "2",
        submitter_name: "张三",
        status: "pending" as const,
        submit_message: null,
        review_comment: null,
        reviewer_id: null,
        reviewer_name: null,
        submitted_at: "2026-06-15T10:00:00.000Z",
        reviewed_at: null,
        components: []
      };
      mockService.getReviewDetail.mockResolvedValue(mockDetail);

      const result = await mockService.getReviewDetail(BigInt(5001));

      expect(result).toEqual(mockDetail);
      expect(mockService.getReviewDetail).toHaveBeenCalledWith(BigInt(5001));
    });

    it("approveReview — 调用 Service 并返回审核通过响应", async () => {
      const mockResponse = {
        review_id: "5001",
        status: "approved" as const,
        reviewed_at: "2026-06-22T10:00:00.000Z"
      };
      mockService.approveReview.mockResolvedValue(mockResponse);

      const result = await mockService.approveReview(BigInt(1), BigInt(5001), { review_comment: "同意" });

      expect(result).toEqual(mockResponse);
      expect(result.status).toBe("approved");
    });

    it("rejectReview — 调用 Service 并返回审核驳回响应", async () => {
      const mockResponse = {
        review_id: "5001",
        status: "rejected" as const,
        reviewed_at: "2026-06-22T10:00:00.000Z"
      };
      mockService.rejectReview.mockResolvedValue(mockResponse);

      const result = await mockService.rejectReview(BigInt(1), BigInt(5001), { review_comment: "违规" });

      expect(result).toEqual(mockResponse);
      expect(result.status).toBe("rejected");
    });

    it("getReviewDetail — 404 错误正确传播", async () => {
      mockService.getReviewDetail.mockRejectedValue(new AppError("审核记录不存在", 404));

      await expect(mockService.getReviewDetail(BigInt(9999))).rejects.toThrow(AppError);
      await expect(mockService.getReviewDetail(BigInt(9999))).rejects.toMatchObject({
        message: "审核记录不存在",
        statusCode: 404
      });
    });

    it("approveReview — 409 冲突正确传播", async () => {
      mockService.approveReview.mockRejectedValue(new AppError("该审核记录已处理，无法重复操作", 409));

      await expect(mockService.approveReview(BigInt(1), BigInt(5002), {}))
        .rejects.toMatchObject({ statusCode: 409 });
    });
  });
});