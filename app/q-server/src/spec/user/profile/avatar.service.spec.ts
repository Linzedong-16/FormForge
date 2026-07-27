/**
 * AvatarService 单元测试
 *
 * 覆盖：头像上传成功后的“双写”行为 —— UserProfile.avatar_url（主，同步必成功）
 *       与 MediaAsset 物料登记（次，FR-005 已改为同步 await，失败仅告警不影响头像上传）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AvatarService } from "../../../modules/user/profile/avatar.service.js";
import { createFastifyMock } from "../../utils/test-helpers.js";

// 隔离图片处理库：sharp 的元数据读取/压缩管道在单测中不应真实处理图片二进制数据
vi.mock("sharp", () => {
  const chain = {
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 800 }),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("compressed-fake-image")),
  };
  return { default: vi.fn(() => chain) };
});

// 隔离魔数校验：固定返回合法的 image/jpeg，聚焦物料登记双写行为本身
vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn().mockResolvedValue({ mime: "image/jpeg", ext: "jpg" }),
}));

// 隔离 MinIO 实际 I/O：与 media-asset.service.spec.ts 的隔离原则一致
vi.mock("../../../utils/upload.js", () => ({
  uploadToMinioWithKey: vi.fn((_fastify: unknown, _buffer: Buffer, key: string) =>
    Promise.resolve(`http://localhost:9000/questionnaire/${key}`)
  ),
  deleteFromMinio: vi.fn().mockResolvedValue(undefined),
  extractKey: vi.fn().mockReturnValue(null),
}));

const USER_ID = BigInt(2);
const FAKE_FILE = Buffer.from("raw-avatar-bytes");

describe("AvatarService.upload", () => {
  let fastify: ReturnType<typeof createFastifyMock>;
  let service: AvatarService;

  beforeEach(() => {
    fastify = createFastifyMock();
    service = new AvatarService(fastify);
    vi.clearAllMocks();

    // 默认：当前无旧头像、UserProfile 写入正常
    fastify.prisma.userProfile.findUnique.mockResolvedValue(null);
    fastify.prisma.userProfile.upsert.mockResolvedValue({});
    fastify.prisma.auditLog.create.mockResolvedValue({});
  });

  it("物料登记成功时，同步等待完成后再返回，且 MediaAsset 字段正确关联头像", async () => {
    fastify.prisma.mediaAsset.create.mockResolvedValue({ id: BigInt(9999) });

    const result = await service.upload(USER_ID, FAKE_FILE, "image/jpeg");

    // 主写：UserProfile.avatar_url 已同步更新为原图 URL
    expect(fastify.prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER_ID },
        update: { avatar_url: result.avatarUrl },
      })
    );

    // 次写：物料登记已同步等待完成（此处能断言到具体字段，说明 create 已 resolve）
    expect(fastify.prisma.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        survey_id: null,
        user_id: USER_ID,
        resource_type: "image",
        file_url: result.avatarUrl,
        file_type: "user_avatar",
        review_status: "pending",
      }),
    });

    // 登记成功时不应产生告警日志
    expect(fastify.log.warn).not.toHaveBeenCalled();
  });

  it("物料登记失败（如枚举值未迁移）时，头像上传仍返回成功，且告警日志含 err/userId/fileUrl", async () => {
    const registerError = new Error("invalid input value for enum media_asset_file_type: \"user_avatar\"");
    fastify.prisma.mediaAsset.create.mockRejectedValue(registerError);

    const result = await service.upload(USER_ID, FAKE_FILE, "image/jpeg");

    // 头像功能价值高于物料登记：即使次写失败，主流程仍正常返回
    expect(result.avatarUrl).toMatch(/^http:\/\/localhost:9000\/questionnaire\//);
    expect(result.thumbnailUrl).toMatch(/^http:\/\/localhost:9000\/questionnaire\//);

    // 主写不受影响，头像 URL 已落库
    expect(fastify.prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { avatar_url: result.avatarUrl } })
    );

    // 失败必须记录 warn 日志，且包含 err/userId/fileUrl，不能静默吞掉
    expect(fastify.log.warn).toHaveBeenCalledWith(
      {
        err: registerError,
        userId: String(USER_ID),
        fileUrl: result.avatarUrl,
      },
      "[avatar] 物料登记失败，不影响头像上传本身"
    );
  });
});
