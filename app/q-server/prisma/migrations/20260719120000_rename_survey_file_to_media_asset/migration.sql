-- 手写迁移：SurveyFile → MediaAsset 重命名 + 扩展审核字段
--
-- 重要：本迁移使用 RENAME 而非 DROP+CREATE，以保留 survey_files 表中已有的存量数据
-- （问卷题目图片、签名图片的既有登记记录），不能替换为 `prisma migrate diff` 直接生成的
-- 版本——那个版本会被 Prisma 结构化对比误判为"删表重建"，导致存量数据丢失。

-- ── 1. 重命名表本体 ──────────────────────────────────────────
ALTER TABLE "survey_files" RENAME TO "media_assets";

-- ── 2. 重命名主键约束，与 Prisma 按新表名生成的默认命名对齐 ──
ALTER TABLE "media_assets" RENAME CONSTRAINT "survey_files_pkey" TO "media_assets_pkey";

-- ── 3. 重命名外键约束 ────────────────────────────────────────
ALTER TABLE "media_assets" RENAME CONSTRAINT "survey_files_survey_id_fkey" TO "media_assets_survey_id_fkey";
ALTER TABLE "media_assets" RENAME CONSTRAINT "survey_files_user_id_fkey" TO "media_assets_user_id_fkey";

-- ── 4. 重命名既有索引 ────────────────────────────────────────
ALTER INDEX "survey_files_survey_id_idx" RENAME TO "media_assets_survey_id_idx";
ALTER INDEX "survey_files_user_id_idx" RENAME TO "media_assets_user_id_idx";
ALTER INDEX "survey_files_file_type_idx" RENAME TO "media_assets_file_type_idx";
ALTER INDEX "survey_files_created_at_idx" RENAME TO "media_assets_created_at_idx";
ALTER INDEX "survey_files_survey_id_file_type_idx" RENAME TO "media_assets_survey_id_file_type_idx";

-- ── 5. FileType 枚举新增取值（用户头像） ───────────────────────
ALTER TYPE "FileType" ADD VALUE IF NOT EXISTS 'user_avatar';

-- ── 6. 新增审核相关字段 ──────────────────────────────────────
-- 存量数据全部归入 pending（待审核），而非 ReviewStatus 的 none，
-- 确保上线前已存在的图片资源同样进入审核视野，不被静默排除（见 research.md 决策 1）。
ALTER TABLE "media_assets"
  ADD COLUMN "resource_type" TEXT NOT NULL DEFAULT 'image',
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "review_status" "ReviewStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "reviewed_by" BIGINT,
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "review_comment" TEXT;

-- ── 7. 新增复合/单列索引 ─────────────────────────────────────
CREATE INDEX "media_assets_review_status_idx" ON "media_assets"("review_status");
CREATE INDEX "media_assets_user_id_review_status_idx" ON "media_assets"("user_id", "review_status");

-- ── 8. 新增 reviewed_by 外键 ─────────────────────────────────
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
