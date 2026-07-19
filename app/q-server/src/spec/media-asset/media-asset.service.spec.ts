/**
 * MediaAssetService 单元测试
 *
 * 覆盖：列表筛选/分页、详情+引用检测、更新元信息、审核状态自由互转、
 *       删除（存在引用时阻止）、批量删除部分失败、直接上传（非图片拒绝/成功默认 pending）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaAssetService } from "../../modules/media-asset/media-asset.service.js";
import { AppError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { createFastifyMock, MOCK_MEDIA_ASSET, MOCK_SURVEY, MOCK_COMPONENT } from "../utils/test-helpers.js";

// 隔离 MinIO 实际 I/O：uploadMediaAsset/deleteMediaAsset 依赖的对象存储上传/删除
// 在单测中不应真实发起网络调用，与 SurveyFileService 等其它模块的测试隔离原则一致
vi.mock("../../utils/upload.js", () => ({
  uploadToMinioWithKey: vi.fn().mockResolvedValue("http://localhost:9000/questionnaire/media-assets/uuid.png"),
  deleteFromMinio: vi.fn().mockResolvedValue(undefined),
}));

const OPERATOR_ID = BigInt(1);
const ASSET_ID = BigInt(5001);

describe("MediaAssetService", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let service: MediaAssetService;

  beforeEach(() => {
    fastify = createFastifyMock();
    service = new MediaAssetService(fastify);
    vi.clearAllMocks();
  });

  // ============================================================
  //  listMediaAssets（User Story 1）
  // ============================================================

  describe("listMediaAssets", () => {
    it("按 user_id/survey_id/review_status/keyword 组合筛选并分页", async () => {
      fastify.prisma.mediaAsset.findMany.mockResolvedValue([MOCK_MEDIA_ASSET]);
      fastify.prisma.mediaAsset.count.mockResolvedValue(1);

      const result = await service.listMediaAssets({
        page: 1,
        page_size: 20,
        user_id: "2",
        survey_id: "100",
        review_status: "pending",
        keyword: "cover",
      });

      expect(fastify.prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_id: BigInt(2),
            survey_id: BigInt(100),
            review_status: "pending",
            file_name: { contains: "cover", mode: "insensitive" },
          }),
        }),
      );
      expect(result.list).toHaveLength(1);
      expect(result.list[0]!.id).toBe("5001");
      expect(result.pagination).toEqual({ page: 1, page_size: 20, total: 1, total_pages: 1 });
    });

    it("无筛选条件时返回全部分页结果", async () => {
      fastify.prisma.mediaAsset.findMany.mockResolvedValue([]);
      fastify.prisma.mediaAsset.count.mockResolvedValue(0);

      const result = await service.listMediaAssets({ page: 1, page_size: 20 });

      expect(result.list).toEqual([]);
      expect(result.pagination.total_pages).toBe(1); // Math.ceil(0/20) || 1 = 1，避免展示 0 页
    });
  });

  // ============================================================
  //  detectReferences（供详情与删除保护共用）
  // ============================================================

  describe("detectReferences", () => {
    it("命中问卷题目配置引用时返回 survey_component 类型引用", async () => {
      fastify.prisma.survey.findMany.mockResolvedValue([
        {
          ...MOCK_SURVEY,
          components: [{ ...MOCK_COMPONENT, config: { pic: { url: MOCK_MEDIA_ASSET.file_url } } }],
        },
      ]);
      fastify.prisma.userProfile.findFirst.mockResolvedValue(null);

      const references = await service.detectReferences(MOCK_MEDIA_ASSET.file_url);

      expect(references).toHaveLength(1);
      expect(references[0]).toMatchObject({ type: "survey_component", survey_id: "100" });
    });

    it("命中用户当前头像时返回 user_avatar 类型引用", async () => {
      fastify.prisma.survey.findMany.mockResolvedValue([]);
      fastify.prisma.userProfile.findFirst.mockResolvedValue({ user_id: BigInt(2) });

      const references = await service.detectReferences(MOCK_MEDIA_ASSET.file_url);

      expect(references).toEqual([{ type: "user_avatar", user_id: "2" }]);
    });

    it("无任何引用时返回空数组", async () => {
      fastify.prisma.survey.findMany.mockResolvedValue([]);
      fastify.prisma.userProfile.findFirst.mockResolvedValue(null);

      const references = await service.detectReferences(MOCK_MEDIA_ASSET.file_url);

      expect(references).toEqual([]);
    });
  });

  // ============================================================
  //  getMediaAssetById（User Story 1）
  // ============================================================

  describe("getMediaAssetById", () => {
    it("物料不存在时抛出 404", async () => {
      fastify.prisma.mediaAsset.findUnique.mockResolvedValue(null);

      await expect(service.getMediaAssetById(ASSET_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: BizCode.FILE_NOT_FOUND,
      });
    });

    it("成功返回详情并附带引用检测结果", async () => {
      fastify.prisma.mediaAsset.findUnique.mockResolvedValue(MOCK_MEDIA_ASSET);
      fastify.prisma.survey.findMany.mockResolvedValue([]);
      fastify.prisma.userProfile.findFirst.mockResolvedValue(null);

      const detail = await service.getMediaAssetById(ASSET_ID);

      expect(detail.id).toBe("5001");
      expect(detail.references).toEqual([]);
    });
  });

  // ============================================================
  //  updateMediaAsset（User Story 3）
  // ============================================================

  describe("updateMediaAsset", () => {
    it("成功更新元信息并写入审计日志", async () => {
      fastify.prisma.mediaAsset.findUnique.mockResolvedValue(MOCK_MEDIA_ASSET);
      fastify.prisma.mediaAsset.update.mockResolvedValue({ ...MOCK_MEDIA_ASSET, resource_type: "image" });
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateMediaAsset(ASSET_ID, { resource_type: "image" }, OPERATOR_ID);

      expect(result.resource_type).toBe("image");
      expect(fastify.prisma.mediaAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ASSET_ID } }),
      );
    });

    it("物料不存在时抛出 404，不执行更新", async () => {
      fastify.prisma.mediaAsset.findUnique.mockResolvedValue(null);

      await expect(service.updateMediaAsset(ASSET_ID, { resource_type: "image" }, OPERATOR_ID)).rejects.toThrow(
        AppError,
      );
      expect(fastify.prisma.mediaAsset.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  //  changeReviewStatus（User Story 3 — 自由互转 + 审计留痕）
  // ============================================================

  describe("changeReviewStatus", () => {
    it.each([
      ["pending", "approved"],
      ["approved", "rejected"],
      ["rejected", "approved"],
      ["approved", "pending"],
    ])("允许从 %s 变更为 %s（无前置状态限制）", async (fromStatus, toStatus) => {
      fastify.prisma.mediaAsset.findUnique.mockResolvedValue({ ...MOCK_MEDIA_ASSET, review_status: fromStatus });
      fastify.prisma.mediaAsset.update.mockResolvedValue({
        ...MOCK_MEDIA_ASSET,
        review_status: toStatus,
        reviewed_by: OPERATOR_ID,
        reviewed_at: new Date(),
      });
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await service.changeReviewStatus(
        ASSET_ID,
        { review_status: toStatus as "pending" | "approved" | "rejected", review_comment: "复核意见" },
        OPERATOR_ID,
      );

      expect(result.review_status).toBe(toStatus);
      expect(result.reviewed_by).toBe(String(OPERATOR_ID));
    });

    it("写入正确的 reviewed_by/reviewed_at/review_comment 与一条 AuditLog", async () => {
      fastify.prisma.mediaAsset.findUnique.mockResolvedValue(MOCK_MEDIA_ASSET);
      fastify.prisma.mediaAsset.update.mockResolvedValue({
        ...MOCK_MEDIA_ASSET,
        review_status: "approved",
        reviewed_by: OPERATOR_ID,
        reviewed_at: new Date("2026-07-19T10:00:00.000Z"),
        review_comment: "内容符合规范",
      });
      fastify.prisma.auditLog.create.mockResolvedValue({});

      await service.changeReviewStatus(ASSET_ID, { review_status: "approved", review_comment: "内容符合规范" }, OPERATOR_ID);

      expect(fastify.prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: ASSET_ID },
        data: expect.objectContaining({
          review_status: "approved",
          reviewed_by: OPERATOR_ID,
          review_comment: "内容符合规范",
        }),
      });
      expect(fastify.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "media_asset.review_status_change" }),
        }),
      );
    });
  });

  // ============================================================
  //  deleteMediaAsset（User Story 2 — 存在有效引用时阻止）
  // ============================================================

  describe("deleteMediaAsset", () => {
    it("存在有效引用时返回引用列表，不执行删除", async () => {
      fastify.prisma.mediaAsset.findUnique.mockResolvedValue(MOCK_MEDIA_ASSET);
      fastify.prisma.survey.findMany.mockResolvedValue([
        {
          ...MOCK_SURVEY,
          components: [{ ...MOCK_COMPONENT, config: { pic: { url: MOCK_MEDIA_ASSET.file_url } } }],
        },
      ]);
      fastify.prisma.userProfile.findFirst.mockResolvedValue(null);

      const references = await service.deleteMediaAsset(ASSET_ID, OPERATOR_ID);

      expect(references).toHaveLength(1);
      expect(fastify.prisma.mediaAsset.delete).not.toHaveBeenCalled();
    });

    it("无引用时删除成功并写入审计日志", async () => {
      fastify.prisma.mediaAsset.findUnique.mockResolvedValue(MOCK_MEDIA_ASSET);
      fastify.prisma.survey.findMany.mockResolvedValue([]);
      fastify.prisma.userProfile.findFirst.mockResolvedValue(null);
      fastify.prisma.mediaAsset.delete.mockResolvedValue(MOCK_MEDIA_ASSET);
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const references = await service.deleteMediaAsset(ASSET_ID, OPERATOR_ID);

      expect(references).toBeNull();
      expect(fastify.prisma.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: ASSET_ID } });
    });

    it("物料不存在时抛出 404", async () => {
      fastify.prisma.mediaAsset.findUnique.mockResolvedValue(null);

      await expect(service.deleteMediaAsset(ASSET_ID, OPERATOR_ID)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ============================================================
  //  batchDeleteMediaAssets（User Story 2 — 混合结果归并）
  // ============================================================

  describe("batchDeleteMediaAssets", () => {
    it("混合成功/引用阻止/不存在场景下正确归并 succeeded 与 failed", async () => {
      const ID_OK = BigInt(1);
      const ID_REFERENCED = BigInt(2);
      const ID_MISSING = BigInt(3);

      fastify.prisma.mediaAsset.findUnique.mockImplementation(({ where }: { where: { id: bigint } }) => {
        if (where.id === ID_MISSING) return Promise.resolve(null);
        return Promise.resolve({ ...MOCK_MEDIA_ASSET, id: where.id });
      });
      fastify.prisma.survey.findMany.mockImplementation(() => {
        // 简化：通过外部状态区分是否命中引用，这里统一在 detectReferences 内按 file_url 判断，
        // 由于 mock 数据 file_url 相同，改为直接 mock survey 返回内容按调用次数区分
        return Promise.resolve([]);
      });
      fastify.prisma.userProfile.findFirst.mockResolvedValue(null);
      fastify.prisma.mediaAsset.delete.mockResolvedValue({});
      fastify.prisma.auditLog.create.mockResolvedValue({});

      // 直接 spy detectReferences，避免在批量场景里重复搭建复杂的 JSON 扫描 mock
      const spy = vi.spyOn(service, "detectReferences").mockImplementation(async () => []);
      spy.mockImplementationOnce(async () => []); // ID_OK：无引用
      spy.mockImplementationOnce(async () => [{ type: "user_avatar", user_id: "9" }]); // ID_REFERENCED：有引用

      const result = await service.batchDeleteMediaAssets([ID_OK, ID_REFERENCED, ID_MISSING], OPERATOR_ID);

      expect(result.succeeded).toEqual(["1"]);
      expect(result.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "2", reason: "referenced" }),
          expect.objectContaining({ id: "3", reason: "not_found" }),
        ]),
      );
      expect(result.failed).toHaveLength(2);
    });
  });

  // ============================================================
  //  uploadMediaAsset（User Story 4）
  // ============================================================

  describe("uploadMediaAsset", () => {
    it("非图片 MIME 类型被拒绝（415）", async () => {
      await expect(
        service.uploadMediaAsset(OPERATOR_ID, Buffer.from("fake-pdf"), "application/pdf", "doc.pdf"),
      ).rejects.toMatchObject({ statusCode: 415, code: BizCode.UNSUPPORTED_FILE_TYPE });

      expect(fastify.prisma.mediaAsset.create).not.toHaveBeenCalled();
    });

    it("成功上传的物料默认审核状态为 pending", async () => {
      fastify.prisma.mediaAsset.create.mockResolvedValue({ ...MOCK_MEDIA_ASSET, review_status: "pending" });
      fastify.prisma.auditLog.create.mockResolvedValue({});

      const result = await service.uploadMediaAsset(OPERATOR_ID, Buffer.from("fake-image"), "image/png", "new.png");

      expect(result.review_status).toBe("pending");
      expect(fastify.prisma.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ review_status: "pending" }) }),
      );
    });
  });
});
