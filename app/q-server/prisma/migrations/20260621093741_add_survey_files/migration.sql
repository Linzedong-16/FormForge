-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('survey_option_image', 'survey_signature', 'survey_cover');

-- CreateTable
CREATE TABLE "survey_files" (
    "id" BIGSERIAL NOT NULL,
    "survey_id" BIGINT,
    "user_id" BIGINT NOT NULL,
    "file_url" VARCHAR(1024) NOT NULL,
    "file_key" VARCHAR(512) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "file_type" "FileType" NOT NULL DEFAULT 'survey_option_image',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "survey_files_survey_id_idx" ON "survey_files"("survey_id");

-- CreateIndex
CREATE INDEX "survey_files_user_id_idx" ON "survey_files"("user_id");

-- CreateIndex
CREATE INDEX "survey_files_file_type_idx" ON "survey_files"("file_type");

-- CreateIndex
CREATE INDEX "survey_files_created_at_idx" ON "survey_files"("created_at");

-- CreateIndex
CREATE INDEX "survey_files_survey_id_file_type_idx" ON "survey_files"("survey_id", "file_type");

-- AddForeignKey
ALTER TABLE "survey_files" ADD CONSTRAINT "survey_files_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_files" ADD CONSTRAINT "survey_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
