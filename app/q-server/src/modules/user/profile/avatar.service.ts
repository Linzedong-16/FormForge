/**
 * 头像上传服务 — 图片校验、压缩处理、MinIO 上传
 *
 * 处理流程：
 *   1. 接收文件 Buffer
 *   2. 校验 MIME 类型（魔数校验）
 *   3. 校验文件大小（≤ 5MB）
 *   4. 使用 sharp 读取图片元数据
 *   5. 校验图片尺寸（200x200 ~ 4096x4096）
 *   6. 并行压缩原图 800x800 + 缩略图 200x200
 *   7. 并行上传到 MinIO
 *   8. 更新 UserProfile.avatar_url
 *   9. 异步删除旧头像文件
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import type { FastifyInstance } from "fastify";
import { ValidationError } from "../../../utils/errors.js";
import { BizCode } from "../../../utils/response.js";
import { uploadToMinioWithKey, deleteFromMinio, extractKey } from "../../../utils/upload.js";
import { ProfileService } from "./profile.service.js";

// ─── 常量配置 ────────────────────────────────────────────────

/** 支持的 MIME 类型 */
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** 最大文件大小：5MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** 图片尺寸限制 */
const MIN_DIMENSION = 200;
const MAX_DIMENSION = 4096;

/** 输出尺寸 */
const ORIGINAL_MAX_SIZE = 800;
const THUMBNAIL_SIZE = 200;

/** 输出质量 */
const ORIGINAL_QUALITY = 85;
const THUMBNAIL_QUALITY = 80;

/** 头像存储前缀 */
const AVATAR_PREFIX = process.env.MINIO_AVATAR_PREFIX ?? "avatars";

// ─── 类型定义 ────────────────────────────────────────────────

/** 头像上传结果 */
export interface AvatarUploadResult {
  avatarUrl: string;
  thumbnailUrl: string;
}

// ─── 头像上传服务类 ──────────────────────────────────────────

export class AvatarService {
  private readonly profileService: ProfileService;

  constructor(private readonly fastify: FastifyInstance) {
    this.profileService = new ProfileService(fastify);
  }

  /**
   * 上传头像（完整处理流程）
   *
   * @param userId   用户 ID
   * @param file     multipart 上传的文件 Buffer
   * @param mimeType 文件 Content-Type
   * @returns 原图 URL + 缩略图 URL
   */
  async upload(userId: bigint, file: Buffer, mimeType: string): Promise<AvatarUploadResult> {
    // 0. 空文件检查
    if (file.length === 0) {
      throw new ValidationError("上传文件不能为空", BizCode.AVATAR_FORMAT_INVALID);
    }

    // 1. 校验 MIME 类型（魔数 + Content-Type 双重校验）
    await this.validateMimeType(file, mimeType);

    // 2. 校验文件大小
    if (file.length > MAX_FILE_SIZE) {
      throw new ValidationError(`图片大小不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB`, BizCode.AVATAR_TOO_LARGE);
    }

    // 3. 读取图片元数据并校验尺寸
    const metadata = await this.getMetadata(file);
    await this.validateDimensions(metadata.width, metadata.height);

    // 4. 获取旧头像 URL（用于后续清理）
    const oldAvatarUrl = await this.getCurrentAvatarUrl(userId);

    // 5. 生成唯一文件名（预计算对象键，确保原图/缩略图后缀一致）
    const id = randomUUID();
    const originalKey = `${AVATAR_PREFIX}/${id}_original.jpg`;
    const thumbKey = `${AVATAR_PREFIX}/${id}_thumb.jpg`;

    // 6. 并行压缩原图 + 缩略图（两个 sharp 管道独立处理，互不依赖）
    const [originalBuffer, thumbBuffer] = await Promise.all([
      this.processImage(file, {
        width: ORIGINAL_MAX_SIZE,
        height: ORIGINAL_MAX_SIZE,
        fit: "inside",
        quality: ORIGINAL_QUALITY
      }),
      this.processImage(file, {
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        fit: "cover",
        quality: THUMBNAIL_QUALITY
      })
    ]);

    // 7. 并行上传到 MinIO
    const [originalUrl, thumbUrl] = await Promise.all([
      uploadToMinioWithKey(this.fastify, originalBuffer, originalKey, "image/jpeg"),
      uploadToMinioWithKey(this.fastify, thumbBuffer, thumbKey, "image/jpeg")
    ]);

    // 8. 更新数据库中的头像 URL
    await this.profileService.updateAvatarUrl(userId, originalUrl);

    // 9. 异步删除旧头像文件（不阻塞响应）
    this.cleanupOldAvatar(oldAvatarUrl).catch(err => {
      this.fastify.log.warn({ err }, "旧头像清理失败");
    });

    return {
      avatarUrl: originalUrl,
      thumbnailUrl: thumbUrl
    };
  }

  // ============================================================
  //  私有方法
  // ============================================================

  /** 校验 MIME 类型 */
  private async validateMimeType(file: Buffer, contentDispositionMime: string): Promise<void> {
    // 魔数校验（file-type 库读取文件头部字节，比 Content-Type 更可靠）
    const detected = await fileTypeFromBuffer(file);

    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new ValidationError("仅支持 JPG、PNG、GIF、WebP 格式的图片", BizCode.AVATAR_FORMAT_INVALID);
    }

    // Content-Type 与魔数检测结果不一致时仍以魔数为准，仅记录日志
    if (detected.mime !== contentDispositionMime) {
      this.fastify.log.warn(
        {
          declared: contentDispositionMime,
          detected: detected.mime
        },
        "头像 MIME 类型声明与实际不符"
      );
    }
  }

  /** 读取图片元数据 */
  private async getMetadata(file: Buffer): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(file).metadata();
      if (!metadata.width || !metadata.height) {
        throw new ValidationError("图片文件已损坏，无法读取尺寸信息", BizCode.AVATAR_FORMAT_INVALID);
      }
      return { width: metadata.width, height: metadata.height };
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError("图片文件已损坏，无法读取", BizCode.AVATAR_FORMAT_INVALID);
    }
  }

  /** 校验图片尺寸 */
  private async validateDimensions(width: number, height: number): Promise<void> {
    const minDim = Math.min(width, height);
    const maxDim = Math.max(width, height);

    if (minDim < MIN_DIMENSION) {
      throw new ValidationError(`图片尺寸不能小于 ${MIN_DIMENSION}x${MIN_DIMENSION} 像素`, BizCode.AVATAR_SIZE_INVALID);
    }

    if (maxDim > MAX_DIMENSION) {
      throw new ValidationError(`图片尺寸不能超过 ${MAX_DIMENSION}x${MAX_DIMENSION} 像素`, BizCode.AVATAR_SIZE_INVALID);
    }
  }

  /** 压缩图片 */
  private async processImage(
    file: Buffer,
    options: { width: number; height: number; fit: "inside" | "cover"; quality: number }
  ): Promise<Buffer> {
    return sharp(file)
      .resize(options.width, options.height, {
        fit: options.fit,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ quality: options.quality, mozjpeg: true })
      .toBuffer();
  }

  /** 获取当前头像 URL */
  private async getCurrentAvatarUrl(userId: bigint): Promise<string | null> {
    const profile = await this.fastify.prisma.userProfile.findUnique({
      where: { user_id: userId },
      select: { avatar_url: true }
    });
    return profile?.avatar_url ?? null;
  }

  /** 清理旧头像文件 */
  private async cleanupOldAvatar(avatarUrl: string | null): Promise<void> {
    if (!avatarUrl) return;

    // 检查是否为 MinIO 存储的文件（非默认头像 / 外部 URL）
    const key = extractKey(avatarUrl);
    if (!key) return;

    try {
      // 删除原图
      await deleteFromMinio(this.fastify, key);
      this.fastify.log.info(`旧头像已删除: ${key}`);

      // 尝试删除对应的缩略图
      const ext = path.extname(key);
      const baseName = key.slice(0, -ext.length);
      const thumbKey = `${baseName.replace("_original", "")}_thumb.jpg`;
      if (thumbKey !== key) {
        await deleteFromMinio(this.fastify, thumbKey).catch(() => {
          // 缩略图可能不存在，忽略错误
        });
      }
    } catch (err) {
      // 旧文件删除失败不阻塞业务
      this.fastify.log.warn({ err, key }, "旧头像删除失败");
    }
  }
}
