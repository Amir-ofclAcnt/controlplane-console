/*
  Warnings:

  - A unique constraint covering the columns `[environmentId,eventId]` on the table `Event` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "eventId" UUID;

-- AlterTable
ALTER TABLE "RequestLog" ADD COLUMN     "requestId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Event_environmentId_eventId_key" ON "Event"("environmentId", "eventId");
