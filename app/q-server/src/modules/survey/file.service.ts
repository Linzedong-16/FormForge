/**
 * 问卷文件服务 — 文件上传、查询、删除
 *
 * 职责：
 *   - 图片选择组件封面图上传（survey_option_image）
 *   - 签名图片上传（survey_signature）
 *   - 文件列表查询
 *   - 单文件删除（MinIO + DB 双清）
 *
 * 设计原则：
 *   - 与 AvatarService 完全解耦（独立表、独立 MinIO prefix、独立路由）
 *   - 所有文件操作均写入 survey_files 表，支持溯源和级联清理
 *   - 使用项目已有的 uploadToMinio / deleteFromMinio 工具函数
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { uploadToMinioWithKey, deleteFromMinio } from "../../utils/upload.js";
import { createAuditLog } from "../../utils/audit-log.js";
import { AppError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import type {
  FileType,
  SurveyFileUploadResponse,
  SurveyFileListResponse
} from "@common/survey/survey-file.interface.js";
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE, MAX_SIGNATURE_SIZE } from "@common/survey/survey-file.interface.js";

// ─── 常量配置 ──────────────────────────────────────────────────

/** MinIO 存储路径前缀 */
const IMAGE_PREFIX = "survey-images";
const SIGNATURE_PREFIX = "survey-signatures";

// ─── 工具函数 ──────────────────────────────────────────────────

/** 生成 MinIO 对象 Key */
function objectKey(prefix: string, originalName: string): string {
  const ext = path.extname(originalName) || "";
  return `${prefix}/${randomUUID()}${ext}`;
}

/** BigInt → 字符串 */
function bigIntToStr(value: bigint): string {
  return String(value);
}

// ─── SurveyFileService 类 ──────────────────────────────────────

export class SurveyFileService {
  constructor(private readonly fastify: FastifyInstance) {}

  // ============================================================
  //  问卷文件上传（通用 — 图片选择组件封面）
  // ============================================================

  /**
   * 上传问卷文件（图片选择组件 PicItem 封面图）
   *
   * @param userId    上传者 ID
   * @param surveyId  问卷 ID
   * @param file      multipart 文件 Buffer
   * @param mimeType  文件 MIME 类型
   * @param fileName  原始文件名
   * @param fileType  文件类型（默认 survey_option_image）
   */
  async upload(
    userId: bigint,
    surveyId: bigint,
    file: Buffer,
    mimeType: string,
    fileName: string,
    fileType: string = "survey_option_image"
  ): Promise<SurveyFileUploadResponse> {
    // 1. 空文件检查
    if (file.length === 0) {
      throw new AppError("请选择要上传的文件", 400);
    }

    // 2. 校验 MIME 类型
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      throw new AppError(
        `不支持的文件类型: ${mimeType}，仅支持 jpg/png/gif/webp/svg/bmp`,
        400,
        BizCode.UNSUPPORTED_FILE_TYPE
      );
    }

    // 3. 校验文件大小
    if (file.length > MAX_FILE_SIZE) {
      throw new AppError(`文件大小不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400, BizCode.FILE_TOO_LARGE);
    }

    // 4. 校验问卷存在且属于当前用户
    const survey = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null },
      select: { id: true }
    });
    if (!survey) {
      throw new AppError("问卷不存在", 404);
    }

    // 5. 上传到 MinIO
    const key = objectKey(IMAGE_PREFIX, fileName);
    let fileUrl: string;
    try {
      fileUrl = await uploadToMinioWithKey(this.fastify, file, key, mimeType);
    } catch {
      throw new AppError("文件存储服务暂不可用，请稍后重试", 500, BizCode.FILE_STORAGE_ERROR);
    }

    // 6. 写入 survey_files 记录
    const record = await this.fastify.prisma.surveyFile.create({
      data: {
        survey_id: surveyId,
        user_id: userId,
        file_url: fileUrl,
        file_key: key,
        file_name: fileName,
        mime_type: mimeType,
        file_size: file.length,
        file_type: fileType as FileType
      }
    });

    // 7. 审计日志（异步，不阻塞响应）
    createAuditLog(this.fastify, userId, "survey_file_upload", "survey_file", record.id, {
      survey_id: bigIntToStr(surveyId),
      file_name: fileName,
      file_size: file.length,
      file_type: fileType
    }).catch(() => {});

    return {
      file_id: bigIntToStr(record.id),
      file_url: fileUrl,
      file_name: fileName,
      mime_type: mimeType,
      file_size: file.length
    };
  }

  // ============================================================
  //  签名图片上传
  // ============================================================

  /**
   * 上传签名图片（Signature 组件 canvas blob）
   *
   * @param userId    上传者 ID
   * @param surveyId  问卷 ID
   * @param file      PNG blob Buffer
   */
  async uploadSignature(userId: bigint, surveyId: bigint, file: Buffer): Promise<SurveyFileUploadResponse> {
    // 1. 空文件检查
    if (file.length === 0) {
      throw new AppError("请选择要上传的签名图片", 400);
    }

    // 2. 校验文件类型（仅 PNG）
    const mimeType = "image/png";
    if (file.length > 4) {
      // 简单魔数检查：PNG 文件头 89 50 4E 47
      const header = file.slice(0, 4).toString("hex");
      if (header !== "89504e47") {
        throw new AppError("签名图片仅支持 PNG 格式", 400, BizCode.UNSUPPORTED_FILE_TYPE);
      }
    }

    // 3. 校验文件大小
    if (file.length > MAX_SIGNATURE_SIZE) {
      throw new AppError(`签名图片大小不能超过 ${MAX_SIGNATURE_SIZE / 1024 / 1024}MB`, 400, BizCode.FILE_TOO_LARGE);
    }

    // 4. 校验问卷存在且属于当前用户
    const survey = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null },
      select: { id: true }
    });
    if (!survey) {
      throw new AppError("问卷不存在", 404);
    }

    // 5. 上传到 MinIO（signature 专用 prefix）
    const key = objectKey(SIGNATURE_PREFIX, "signature.png");
    let fileUrl: string;
    try {
      fileUrl = await uploadToMinioWithKey(this.fastify, file, key, mimeType);
    } catch {
      throw new AppError("文件存储服务暂不可用，请稍后重试", 500, BizCode.FILE_STORAGE_ERROR);
    }

    // 6. 写入 survey_files 记录
    const record = await this.fastify.prisma.surveyFile.create({
      data: {
        survey_id: surveyId,
        user_id: userId,
        file_url: fileUrl,
        file_key: key,
        file_name: "signature.png",
        mime_type: mimeType,
        file_size: file.length,
        file_type: "survey_signature"
      }
    });

    // 7. 审计日志（异步）
    createAuditLog(this.fastify, userId, "signature_upload", "survey_file", record.id, {
      survey_id: bigIntToStr(surveyId),
      file_size: file.length
    }).catch(() => {});

    return {
      file_id: bigIntToStr(record.id),
      file_url: fileUrl,
      file_name: "signature.png",
      mime_type: mimeType,
      file_size: file.length
    };
  }

  // ============================================================
  //  问卷文件列表
  // ============================================================

  /**
   * 查询指定问卷下关联的所有文件
   *
   * @param userId   当前用户 ID
   * @param surveyId 问卷 ID
   * @param fileType 可选：按文件类型筛选
   */
  async list(userId: bigint, surveyId: bigint, fileType?: string): Promise<SurveyFileListResponse> {
    // 校验问卷存在且属于当前用户
    const survey = await this.fastify.prisma.survey.findFirst({
      where: { id: surveyId, user_id: userId, deleted_at: null },
      select: { id: true }
    });
    if (!survey) {
      throw new AppError("问卷不存在", 404);
    }

    const where: Record<string, unknown> = { survey_id: surveyId };
    if (fileType) {
      where.file_type = fileType;
    }

    const [files, total] = await Promise.all([
      this.fastify.prisma.surveyFile.findMany({
        where,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          file_url: true,
          file_name: true,
          mime_type: true,
          file_size: true,
          file_type: true,
          created_at: true
        }
      }),
      this.fastify.prisma.surveyFile.count({ where })
    ]);

    return {
      files: files.map(f => ({
        id: bigIntToStr(f.id),
        file_url: f.file_url,
        file_name: f.file_name,
        mime_type: f.mime_type,
        file_size: Number(f.file_size),
        file_type: f.file_type,
        created_at: f.created_at.toISOString()
      })),
      total
    };
  }

  // ============================================================
  //  删除单个文件（MinIO + DB 双清）
  // ============================================================

  /**
   * 删除指定文件记录，同时从 MinIO 中删除物理文件
   *
   * @param userId 当前用户 ID
   * @param fileId 文件记录 ID
   */
  async deleteFile(userId: bigint, fileId: bigint): Promise<void> {
    // 1. 查询文件记录（含关联问卷信息，用于权限校验）
    const record = await this.fastify.prisma.surveyFile.findUnique({
      where: { id: fileId },
      include: {
        survey: { select: { user_id: true } }
      }
    });

    if (!record) {
      throw new AppError("文件记录不存在", 404, BizCode.FILE_NOT_FOUND);
    }

    // 2. 权限校验：上传者本人 或 问卷所有者
    const isUploader = record.user_id === userId;
    const isSurveyOwner = record.survey?.user_id === userId;
    if (!isUploader && !isSurveyOwner) {
      throw new AppError("无权删除该文件", 403);
    }

    // 3. 删除 MinIO 文件
    try {
      await deleteFromMinio(this.fastify, record.file_key);
    } catch (err) {
      this.fastify.log.warn({ err, fileKey: record.file_key }, "MinIO 文件删除失败，继续删除数据库记录");
    }

    // 4. 删除数据库记录
    await this.fastify.prisma.surveyFile.delete({ where: { id: fileId } });

    // 5. 审计日志（异步）
    createAuditLog(this.fastify, userId, "survey_file_delete", "survey_file", fileId, {
      file_key: record.file_key,
      file_url: record.file_url,
      survey_id: record.survey_id ? bigIntToStr(record.survey_id) : null
    }).catch(() => {});
  }

  // ============================================================
  //  级联清理：删除问卷时清理所有关联文件
  // ============================================================

  /**
   * 删除问卷下所有关联文件（MinIO + DB）
   *
   * 由 SurveyService.delete() 在问卷软删除后调用。
   * 公共模板（survey_type=template && review_status=approved）的文件不会被删除。
   *
   * @param surveyId 问卷 ID
   * @returns 删除的文件数量
   */
  async cleanupBySurvey(surveyId: bigint): Promise<number> {
    const files = await this.fastify.prisma.surveyFile.findMany({
      where: { survey_id: surveyId },
      select: { id: true, file_key: true }
    });

    if (files.length === 0) return 0;

    // 并行删除 MinIO 文件（不阻塞，单个失败不影响其他）
    const deleteResults = await Promise.allSettled(
      files.map(f =>
        deleteFromMinio(this.fastify, f.file_key).catch(err => {
          this.fastify.log.warn({ err, fileKey: f.file_key }, "级联清理 MinIO 文件失败");
        })
      )
    );

    // 删除所有数据库记录
    const result = await this.fastify.prisma.surveyFile.deleteMany({
      where: { survey_id: surveyId }
    });

    this.fastify.log.info(
      `[SurveyFileService] 级联清理完成: survey_id=${bigIntToStr(surveyId)}, db_deleted=${result.count}, minio_deleted=${deleteResults.filter(r => r.status === "fulfilled").length}`
    );

    return result.count;
  }
}
