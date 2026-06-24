-- AlterTable: 用户表新增 deleted_by 字段与索引
ALTER TABLE "users" ADD COLUMN "deleted_by" BIGINT;

-- CreateIndex: 按删除操作人查询
CREATE INDEX "idx_users_deleted_by" ON "users"("deleted_by");
