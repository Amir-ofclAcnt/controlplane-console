/*
  Warnings:

  - You are about to drop the column `apiKeyId` on the `UsageBucket` table. All the data in the column will be lost.
  - You are about to drop the column `bucketMs` on the `UsageBucket` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[projectId,environmentId,scopeKey,bucketStart]` on the table `UsageBucket` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `scopeKey` to the `UsageBucket` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "UsageBucket_environmentId_apiKeyId_bucketStart_bucketMs_key";

-- DropIndex
DROP INDEX "UsageBucket_environmentId_bucketStart_idx";

-- DropIndex
DROP INDEX "UsageBucket_projectId_bucketStart_idx";

-- AlterTable
ALTER TABLE "UsageBucket" DROP COLUMN "apiKeyId",
DROP COLUMN "bucketMs",
ADD COLUMN     "scopeKey" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "UsageBucket_projectId_environmentId_bucketStart_idx" ON "UsageBucket"("projectId", "environmentId", "bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "UsageBucket_projectId_environmentId_scopeKey_bucketStart_key" ON "UsageBucket"("projectId", "environmentId", "scopeKey", "bucketStart");
