-- AlterTable
ALTER TABLE "survey_components" ADD COLUMN     "client_key" VARCHAR(64),
ADD COLUMN     "logic" JSONB;

-- CreateIndex
CREATE INDEX "survey_components_survey_id_client_key_idx" ON "survey_components"("survey_id", "client_key");

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "answer_status" SMALLINT;
