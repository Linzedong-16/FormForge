-- ================================================================
-- 索引优化迁移 — surveys + reviews 表
-- 目标：消除冗余索引、覆盖 ORDER BY、支持高频查询
-- ================================================================

-- ── 1. 删除 surveys 冗余索引 ──────────────────────────────────
-- @index([user_id]) 的功能已由 @index([user_id, deleted_at, updated_at]) 的前导列覆盖
DROP INDEX IF EXISTS "surveys_user_id_idx";

-- ── 2. 重建 surveys 列表查询索引（增加 updated_at） ──────────
-- 原：@index([user_id, deleted_at]) → 只覆盖 WHERE，不覆盖 ORDER BY updated_at DESC
DROP INDEX IF EXISTS "surveys_user_id_deleted_at_idx";
CREATE INDEX "surveys_user_id_deleted_at_updated_at_idx"
  ON "surveys" ("user_id", "deleted_at", "updated_at" DESC);

-- ── 3. 新增 surveys 未审核问卷查询索引 ────────────────────────
-- 服务 listUnreviewedSurveys 方法：
--   WHERE deleted_at IS NULL AND review_status = "none" ORDER BY created_at DESC
CREATE INDEX "surveys_deleted_at_review_status_created_at_idx"
  ON "surveys" ("deleted_at", "review_status", "created_at" DESC);

-- ── 4. 重建 reviews 审核列表查询索引（增加 submitted_at） ─────
-- 原：@index([review_type, status]) → 只覆盖 WHERE，不覆盖 ORDER BY submitted_at DESC
DROP INDEX IF EXISTS "reviews_review_type_status_idx";
CREATE INDEX "reviews_review_type_status_submitted_at_idx"
  ON "reviews" ("review_type", "status", "submitted_at" DESC);
