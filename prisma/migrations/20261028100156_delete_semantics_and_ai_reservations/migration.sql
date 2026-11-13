/*
  Warnings:

  - Made the column `organizationId` on table `scan` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `scan_photo` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
ALTER TYPE "AiCallStatus" ADD VALUE 'pending';

-- DropForeignKey
ALTER TABLE "scan" DROP CONSTRAINT "scan_examinerId_fkey";

-- DropForeignKey
ALTER TABLE "scan_photo" DROP CONSTRAINT "scan_photo_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "simulation_answer" DROP CONSTRAINT "simulation_answer_stageId_fkey";

-- AlterTable
ALTER TABLE "scan" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "examinerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "scan_photo" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "simulation_answer" ADD CONSTRAINT "simulation_answer_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "scenario_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan" ADD CONSTRAINT "scan_examinerId_fkey" FOREIGN KEY ("examinerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_photo" ADD CONSTRAINT "scan_photo_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
