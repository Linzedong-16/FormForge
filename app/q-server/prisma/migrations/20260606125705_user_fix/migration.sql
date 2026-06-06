/*
  Warnings:

  - You are about to drop the `_AuditLogToSurvey` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_AuditLogToSurvey" DROP CONSTRAINT "_AuditLogToSurvey_A_fkey";

-- DropForeignKey
ALTER TABLE "_AuditLogToSurvey" DROP CONSTRAINT "_AuditLogToSurvey_B_fkey";

-- DropTable
DROP TABLE "_AuditLogToSurvey";
