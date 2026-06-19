-- CreateEnum
CREATE TYPE "SurveyType" AS ENUM ('personal', 'template');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('none', 'pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "surveys" ADD COLUMN     "category" TEXT,
ADD COLUMN     "cover_url" TEXT,
ADD COLUMN     "download_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rating" DECIMAL(2,1) DEFAULT 0,
ADD COLUMN     "review_status" "ReviewStatus" NOT NULL DEFAULT 'none',
ADD COLUMN     "survey_type" "SurveyType" NOT NULL DEFAULT 'personal';

-- CreateTable
CREATE TABLE "reviews" (
    "id" BIGSERIAL NOT NULL,
    "survey_id" BIGINT NOT NULL,
    "submitter_id" BIGINT NOT NULL,
    "reviewer_id" BIGINT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "submit_message" TEXT,
    "review_comment" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_ratings" (
    "id" BIGSERIAL NOT NULL,
    "template_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "score" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_survey_id_idx" ON "reviews"("survey_id");

-- CreateIndex
CREATE INDEX "reviews_submitter_id_idx" ON "reviews"("submitter_id");

-- CreateIndex
CREATE INDEX "reviews_reviewer_id_idx" ON "reviews"("reviewer_id");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");

-- CreateIndex
CREATE INDEX "reviews_submitted_at_idx" ON "reviews"("submitted_at");

-- CreateIndex
CREATE INDEX "reviews_survey_id_status_idx" ON "reviews"("survey_id", "status");

-- CreateIndex
CREATE INDEX "template_ratings_template_id_idx" ON "template_ratings"("template_id");

-- CreateIndex
CREATE INDEX "template_ratings_template_id_score_idx" ON "template_ratings"("template_id", "score");

-- CreateIndex
CREATE UNIQUE INDEX "template_ratings_template_id_user_id_key" ON "template_ratings"("template_id", "user_id");

-- CreateIndex
CREATE INDEX "surveys_survey_type_review_status_idx" ON "surveys"("survey_type", "review_status");

-- CreateIndex
CREATE INDEX "surveys_survey_type_category_idx" ON "surveys"("survey_type", "category");

-- CreateIndex
CREATE INDEX "surveys_survey_type_download_count_idx" ON "surveys"("survey_type", "download_count");

-- CreateIndex
CREATE INDEX "surveys_survey_type_rating_idx" ON "surveys"("survey_type", "rating");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
