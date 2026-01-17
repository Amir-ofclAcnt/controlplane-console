/*
  Warnings:

  - A unique constraint covering the columns `[projectId,slug]` on the table `Environment` will be added. If there are existing duplicate values, this will fail.
  - Made the column `slug` on table `Environment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Environment" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Environment_projectId_slug_key" ON "Environment"("projectId", "slug");
