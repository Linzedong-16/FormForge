/**
 * 物料管理模块 Zod Schema 单测
 *
 * 覆盖：更新元信息 schema 严格拒绝未声明字段（file_url/file_key 等）、
 *       批量删除数量限制、审核状态枚举校验、物料 ID 格式校验
 */
import { describe, it, expect } from "vitest";
import {
  mediaAssetIdSchema,
  mediaAssetListQuerySchema,
  updateMediaAssetSchema,
  batchDeleteMediaAssetsSchema,
  changeReviewStatusSchema,
} from "../../modules/media-asset/media-asset.schemas.js";

describe("mediaAssetIdSchema", () => {
  it("有效数字字符串 — 转为 BigInt", () => {
    const result = mediaAssetIdSchema.safeParse("5001");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(BigInt(5001));
  });

  it("非数字字符串 — 校验失败", () => {
    expect(mediaAssetIdSchema.safeParse("abc").success).toBe(false);
  });
});

describe("mediaAssetListQuerySchema", () => {
  it("空对象 — 使用默认分页参数", () => {
    const result = mediaAssetListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.page_size).toBe(20);
    }
  });

  it("review_status 取值超出枚举范围 — 校验失败", () => {
    expect(mediaAssetListQuerySchema.safeParse({ review_status: "none" }).success).toBe(false);
  });

  it("page_size 超过 100 — 校验失败", () => {
    expect(mediaAssetListQuerySchema.safeParse({ page_size: 200 }).success).toBe(false);
  });

  it("user_id 非数字字符串 — 校验失败", () => {
    expect(mediaAssetListQuerySchema.safeParse({ user_id: "abc" }).success).toBe(false);
  });
});

describe("updateMediaAssetSchema", () => {
  it("仅传 resource_type — 通过", () => {
    expect(updateMediaAssetSchema.safeParse({ resource_type: "image" }).success).toBe(true);
  });

  it("传 survey_id 为 null（解除关联） — 通过", () => {
    expect(updateMediaAssetSchema.safeParse({ survey_id: null }).success).toBe(true);
  });

  it("包含未声明字段 file_url — 严格模式拒绝（不允许替换文件本体，对应 FR-006）", () => {
    expect(updateMediaAssetSchema.safeParse({ file_url: "http://x.com/a.png" }).success).toBe(false);
  });

  it("包含未声明字段 file_key — 严格模式拒绝", () => {
    expect(updateMediaAssetSchema.safeParse({ file_key: "media-assets/a.png" }).success).toBe(false);
  });
});

describe("batchDeleteMediaAssetsSchema", () => {
  it("空数组 — 校验失败（至少选择一条）", () => {
    expect(batchDeleteMediaAssetsSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it("超过 200 条 — 校验失败", () => {
    const ids = Array.from({ length: 201 }, (_, i) => String(i + 1));
    expect(batchDeleteMediaAssetsSchema.safeParse({ ids }).success).toBe(false);
  });

  it("包含非数字 ID — 校验失败", () => {
    expect(batchDeleteMediaAssetsSchema.safeParse({ ids: ["1", "abc"] }).success).toBe(false);
  });

  it("1~200 条合法数字 ID — 通过", () => {
    expect(batchDeleteMediaAssetsSchema.safeParse({ ids: ["1", "2", "3"] }).success).toBe(true);
  });
});

describe("changeReviewStatusSchema", () => {
  it.each(["pending", "approved", "rejected"])("review_status=%s — 通过", status => {
    expect(changeReviewStatusSchema.safeParse({ review_status: status }).success).toBe(true);
  });

  it("review_status=none — 校验失败（物料审核状态不使用 none）", () => {
    expect(changeReviewStatusSchema.safeParse({ review_status: "none" }).success).toBe(false);
  });

  it("review_comment 超过 500 字符 — 校验失败", () => {
    expect(
      changeReviewStatusSchema.safeParse({ review_status: "approved", review_comment: "a".repeat(501) }).success,
    ).toBe(false);
  });

  it("不带 review_comment — 通过（审核意见可选）", () => {
    expect(changeReviewStatusSchema.safeParse({ review_status: "approved" }).success).toBe(true);
  });
});
