-- CreateEnum
CREATE TYPE "FlagLifecycle" AS ENUM ('ACTIVE', 'ARCHIVED');

-- DropIndex
DROP INDEX "FeatureFlag_projectId_idx";

-- AlterTable
ALTER TABLE "FeatureFlag" ADD COLUMN     "lifecycle" "FlagLifecycle" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "FeatureFlag_projectId_createdAt_idx" ON "FeatureFlag"("projectId", "createdAt");
