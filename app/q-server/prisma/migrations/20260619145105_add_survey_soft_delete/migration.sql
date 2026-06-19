-- AlterTable
ALTER TABLE "surveys" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "surveys_deleted_at_idx" ON "surveys"("deleted_at");

-- CreateIndex
CREATE INDEX "surveys_user_id_deleted_at_idx" ON "surveys"("user_id", "deleted_at");
