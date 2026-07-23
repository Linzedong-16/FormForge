/**
 * 物料（图片资源）管理模块 — 业务逻辑层
 *
 * 职责：
 *   - 全平台物料列表查询（分页 + 按用户/问卷/审核状态/资源类型/关键词筛选）
 *   - 物料详情查询（含当前有效引用来源检测）
 *   - 删除 / 批量删除（存在有效引用时阻止）
 *   - 更新元信息（不允许替换文件本体）
 *   - 审核状态变更（pending/approved/rejected 自由互转，记录审计）
 *   - 直接上传新物料
 *
 * 设计要点（详见 specs/004-material-management/research.md、data-model.md）：
 *   - MediaAsset 由既有 SurveyFile 重命名+扩展而来，不新建并行表
 *   - 审核状态变更仅作管理侧标记，不影响物料在原有引用位置的实际展示
 *   - 完整审核历史通过 AuditLog 追溯，MediaAsset 本身只保存"最近一次"变更
 */
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Prisma } from "../../generated/prisma/client.js";
import { uploadToMinioWithKey, deleteFromMinio } from "../../utils/upload.js";
import { createAuditLog } from "../../utils/audit-log.js";
import { AppError } from "../../utils/errors.js";
import { BizCode } from "../../utils/response.js";
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE } from "@common/survey/survey-file.interface.js";
import type {
  MediaAssetItem,
  MediaAssetDetail,
  MediaAssetReference,
  MediaAssetListResponse,
  BatchDeleteMediaAssetsResponse
} from "@common/media-asset/media-asset.interface.js";
import type {
  MediaAssetListQueryInput,
  UpdateMediaAssetInput,
  ChangeReviewStatusInput
} from "./media-asset.schemas.js";

// ─── 工具函数 ──────────────────────────────────────────────────

function bigIntToStr(value: bigint): string {
  return String(value);
}

/** 生成 MinIO 对象 Key（复用与 survey/file 模块一致的命名策略） */
function objectKey(prefix: string, originalName: string): string {
  const ext = path.extname(originalName) || "";
  return `${prefix}/${randomUUID()}${ext}`;
}

const UPLOAD_PREFIX = "media-assets";

/**
 * 递归扫描任意 JSON 值，判断其中是否存在等于 targetUrl 的字符串。
 *
 * 用于在不假设 SurveyComponent.config 具体字段名（url/imageUrl/pic 等，
 * 不同题型组件写法不一致）的前提下，稳健地检测某个文件 URL 是否被引用。
 */
function jsonContainsUrl(value: unknown, targetUrl: string): boolean {
  if (typeof value === "string") return value === targetUrl;
  if (Array.isArray(value)) return value.some(item => jsonContainsUrl(item, targetUrl));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(v => jsonContainsUrl(v, targetUrl));
  }
  return false;
}

// ─── 转换函数 ──────────────────────────────────────────────────

/** Prisma MediaAsset 行 → MediaAssetItem（供列表/详情共用） */
function toMediaAssetItem(row: {
  id: bigint;
  resource_type: string;
  file_url: string;
  file_key: string;
  file_name: string;
  mime_type: string;
  file_size: bigint;
  file_type: string;
  review_status: string;
  reviewed_by: bigint | null;
  reviewed_at: Date | null;
  review_comment: string | null;
  user_id: bigint;
  survey_id: bigint | null;
  created_at: Date;
  updated_at: Date;
}): MediaAssetItem {
  return {
    id: bigIntToStr(row.id),
    resource_type: row.resource_type,
    file_url: row.file_url,
    file_key: row.file_key,
    file_name: row.file_name,
    mime_type: row.mime_type,
    file_size: Number(row.file_size),
    file_type: row.file_type as MediaAssetItem["file_type"],
    review_status: row.review_status as MediaAssetItem["review_status"],
    reviewed_by: row.reviewed_by !== null ? bigIntToStr(row.reviewed_by) : null,
    reviewed_at: row.reviewed_at?.toISOString() ?? null,
    review_comment: row.review_comment,
    user_id: bigIntToStr(row.user_id),
    survey_id: row.survey_id !== null ? bigIntToStr(row.survey_id) : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

// ─── MediaAssetService 类 ──────────────────────────────────────

/** 物料删除操作结果 */
export interface MediaAssetDeleteResult {
  /** 是否被引用阻止 */
  blocked: boolean;
  /** 引用来源列表（被阻止时返回，告知调用方具体引用） */
  references: MediaAssetReference[];
  /** 是否执行了强制删除（头像物料在用户使用中时） */
  forceDeleted: boolean;
  /** 强制删除时受影响的用户 ID 列表 */
  affectedUserIds: string[];
}

export class MediaAssetService {
  constructor(private readonly fastify: FastifyInstance) {}

  // ============================================================
  //  引用检测（供详情查询与删除保护共用）
  // ============================================================

  /**
   * 检测指定文件 URL 当前是否存在有效引用，返回引用来源列表（空数组表示无引用）。
   *
   * 判定范围（按当前已知的图片消费场景枚举，未来新增图片消费场景需同步补充）：
   *   1. 未软删除问卷（草稿/已发布）的题目组件 config 中包含该 URL
   *   2. 某用户当前头像（UserProfile.avatar_url）等于该 URL
   */
  async detectReferences(fileUrl: string): Promise<MediaAssetReference[]> {
    const references: MediaAssetReference[] = [];

    // 1. 问卷题目配置引用（草稿 status=0 或已发布 status=1，未软删除）
    const surveys = await this.fastify.prisma.survey.findMany({
      where: { deleted_at: null, status: { in: [0, 1] } },
      select: {
        id: true,
        title: true,
        components: { select: { id: true, config: true } }
      }
    });
    for (const survey of surveys) {
      for (const component of survey.components) {
        if (jsonContainsUrl(component.config, fileUrl)) {
          references.push({
            type: "survey_component",
            survey_id: bigIntToStr(survey.id),
            survey_title: survey.title,
            component_id: bigIntToStr(component.id)
          });
        }
      }
    }

    // 2. 用户当前头像
    const profile = await this.fastify.prisma.userProfile.findFirst({
      where: { avatar_url: fileUrl },
      select: { user_id: true }
    });
    if (profile) {
      references.push({ type: "user_avatar", user_id: bigIntToStr(profile.user_id) });
    }

    return references;
  }

  // ============================================================
  //  列表查询（User Story 1）
  // ============================================================

  async listMediaAssets(query: MediaAssetListQueryInput): Promise<MediaAssetListResponse> {
    const where: Prisma.MediaAssetWhereInput = {};
    if (query.user_id) where.user_id = BigInt(query.user_id);
    if (query.survey_id) where.survey_id = BigInt(query.survey_id);
    if (query.review_status) where.review_status = query.review_status;
    if (query.file_type) where.file_type = query.file_type;
    if (query.resource_type) where.resource_type = query.resource_type;
    if (query.keyword) where.file_name = { contains: query.keyword, mode: "insensitive" };

    const [rows, total] = await Promise.all([
      this.fastify.prisma.mediaAsset.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (query.page - 1) * query.page_size,
        take: query.page_size
      }),
      this.fastify.prisma.mediaAsset.count({ where })
    ]);

    return {
      list: rows.map(toMediaAssetItem),
      pagination: {
        page: query.page,
        page_size: query.page_size,
        total,
        total_pages: Math.ceil(total / query.page_size) || 1
      }
    };
  }

  // ============================================================
  //  详情查询（User Story 1，含引用检测）
  // ============================================================

  async getMediaAssetById(id: bigint): Promise<MediaAssetDetail> {
    const row = await this.fastify.prisma.mediaAsset.findUnique({ where: { id } });
    if (!row) {
      throw new AppError("物料不存在", 404, BizCode.FILE_NOT_FOUND);
    }
    const references = await this.detectReferences(row.file_url);
    return { ...toMediaAssetItem(row), references };
  }

  // ============================================================
  //  更新元信息（User Story 3）
  // ============================================================

  async updateMediaAsset(id: bigint, data: UpdateMediaAssetInput, operatorId: bigint): Promise<MediaAssetItem> {
    const existing = await this.fastify.prisma.mediaAsset.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("物料不存在", 404, BizCode.FILE_NOT_FOUND);
    }

    const row = await this.fastify.prisma.mediaAsset.update({
      where: { id },
      data: {
        ...(data.resource_type !== undefined ? { resource_type: data.resource_type } : {}),
        ...(data.survey_id !== undefined ? { survey_id: data.survey_id === null ? null : BigInt(data.survey_id) } : {})
      }
    });

    createAuditLog(this.fastify, operatorId, "media_asset.update", "MediaAsset", id, {
      resource_type: data.resource_type,
      survey_id: data.survey_id
    }).catch(() => {});

    return toMediaAssetItem(row);
  }

  // ============================================================
  //  审核状态变更（User Story 3，预留给未来审核 Agent）
  // ============================================================

  async changeReviewStatus(id: bigint, input: ChangeReviewStatusInput, operatorId: bigint): Promise<MediaAssetItem> {
    const existing = await this.fastify.prisma.mediaAsset.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("物料不存在", 404, BizCode.FILE_NOT_FOUND);
    }

    const fromStatus = existing.review_status;
    const row = await this.fastify.prisma.mediaAsset.update({
      where: { id },
      data: {
        review_status: input.review_status,
        reviewed_by: operatorId,
        reviewed_at: new Date(),
        review_comment: input.review_comment ?? null
      }
    });

    // 完整审核历史通过 AuditLog 追溯，本表只保存最近一次变更
    createAuditLog(this.fastify, operatorId, "media_asset.review_status_change", "MediaAsset", id, {
      from_status: fromStatus,
      to_status: input.review_status,
      comment: input.review_comment ?? null
    }).catch(() => {});

    return toMediaAssetItem(row);
  }

  // ============================================================
  //  删除（User Story 2，存在有效引用时阻止；头像引用时强制删除）
  // ============================================================

  /**
   * 删除单条物料。
   *
   * 引用检测结果处理策略：
   *   - 含 survey_component 引用 → 阻止删除，返回引用列表
   *   - 仅含 user_avatar 引用 → 强制删除：MinIO + DB + UserProfile.avatar_url = null
   *   - 无引用 → 正常删除
   */
  async deleteMediaAsset(id: bigint, operatorId: bigint): Promise<MediaAssetDeleteResult> {
    const record = await this.fastify.prisma.mediaAsset.findUnique({ where: { id } });
    if (!record) {
      throw new AppError("物料不存在", 404, BizCode.FILE_NOT_FOUND);
    }

    const references = await this.detectReferences(record.file_url);

    // 是否存在问卷题目引用（阻止删除的原由）
    const hasSurveyRef = references.some(r => r.type === "survey_component");
    // 是否存在头像引用
    const avatarRefs = references.filter(r => r.type === "user_avatar");

    if (hasSurveyRef) {
      // 含问卷引用 → 无论如何都阻止删除
      return { blocked: true, references, forceDeleted: false, affectedUserIds: [] };
    }

    // 尝试删除 MinIO 文件（best-effort）
    try {
      await deleteFromMinio(this.fastify, record.file_key);
    } catch (err) {
      this.fastify.log.warn({ err, fileKey: record.file_key }, "[media-asset] MinIO 文件删除失败，继续删除数据库记录");
    }

    // 删除数据库记录
    await this.fastify.prisma.mediaAsset.delete({ where: { id } });

    // 如果有头像引用 → 将关联用户的 avatar_url 置 null
    const affectedUserIds: string[] = [];
    if (avatarRefs.length > 0) {
      for (const ref of avatarRefs) {
        if (ref.user_id) {
          try {
            await this.fastify.prisma.userProfile.update({
              where: { user_id: BigInt(ref.user_id) },
              data: { avatar_url: null }
            });
            affectedUserIds.push(ref.user_id);
          } catch (err) {
            this.fastify.log.error(
              { err, userId: ref.user_id },
              "[media-asset] 强制删除头像时更新 UserProfile.avatar_url 失败"
            );
          }
        }
      }
    }

    createAuditLog(this.fastify, operatorId, "media_asset.delete", "MediaAsset", id, {
      file_key: record.file_key,
      file_url: record.file_url,
      force_deleted: avatarRefs.length > 0,
      affected_user_ids: affectedUserIds
    }).catch(() => {});

    return {
      blocked: false,
      references: avatarRefs,
      forceDeleted: avatarRefs.length > 0,
      affectedUserIds
    };
  }

  // ============================================================
  //  批量删除（User Story 2）
  // ============================================================

  async batchDeleteMediaAssets(ids: bigint[], operatorId: bigint): Promise<BatchDeleteMediaAssetsResponse> {
    const succeeded: string[] = [];
    const failed: BatchDeleteMediaAssetsResponse["failed"] = [];

    for (const id of ids) {
      try {
        const result = await this.deleteMediaAsset(id, operatorId);
        if (result.blocked) {
          // 存在问卷引用阻止删除
          failed.push({ id: bigIntToStr(id), reason: "referenced", references: result.references });
        } else {
          // 正常删除或头像强制删除均视为成功
          succeeded.push(bigIntToStr(id));
        }
      } catch (err) {
        if (err instanceof AppError && err.code === BizCode.FILE_NOT_FOUND) {
          failed.push({ id: bigIntToStr(id), reason: "not_found" });
        } else {
          this.fastify.log.error({ err, id: bigIntToStr(id) }, "[media-asset] 批量删除单项失败");
          failed.push({ id: bigIntToStr(id), reason: "storage_error" });
        }
      }
    }

    return { succeeded, failed };
  }

  // ============================================================
  //  直接上传新物料（User Story 4）
  // ============================================================

  async uploadMediaAsset(
    operatorId: bigint,
    file: Buffer,
    mimeType: string,
    fileName: string,
    surveyId?: bigint
  ): Promise<MediaAssetItem> {
    if (file.length === 0) {
      throw new AppError("请选择要上传的文件", 400);
    }
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      throw new AppError(`当前阶段仅支持图片类型文件，不支持: ${mimeType}`, 415, BizCode.UNSUPPORTED_FILE_TYPE);
    }
    if (file.length > MAX_FILE_SIZE) {
      throw new AppError(`文件大小不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400, BizCode.FILE_TOO_LARGE);
    }

    const key = objectKey(UPLOAD_PREFIX, fileName);
    let fileUrl: string;
    try {
      fileUrl = await uploadToMinioWithKey(this.fastify, file, key, mimeType);
    } catch {
      throw new AppError("文件存储服务暂不可用，请稍后重试", 500, BizCode.FILE_STORAGE_ERROR);
    }

    const row = await this.fastify.prisma.mediaAsset.create({
      data: {
        survey_id: surveyId ?? null,
        user_id: operatorId,
        resource_type: "image",
        file_url: fileUrl,
        file_key: key,
        file_name: fileName,
        mime_type: mimeType,
        file_size: file.length,
        file_type: "survey_option_image",
        review_status: "pending"
      }
    });

    createAuditLog(this.fastify, operatorId, "media_asset.create", "MediaAsset", row.id, {
      file_name: fileName,
      file_size: file.length,
      survey_id: surveyId ? bigIntToStr(surveyId) : null
    }).catch(() => {});

    return toMediaAssetItem(row);
  }
}
