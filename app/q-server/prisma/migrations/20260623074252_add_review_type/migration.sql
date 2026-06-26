-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('survey', 'template');

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "review_type" "ReviewType" NOT NULL DEFAULT 'survey';

-- CreateIndex
CREATE INDEX "reviews_review_type_idx" ON "reviews"("review_type");

-- CreateIndex
CREATE INDEX "reviews_review_type_status_idx" ON "reviews"("review_type", "status");
