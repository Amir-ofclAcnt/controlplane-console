-- CreateTable
CREATE TABLE "UsageBucket" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "bucketMs" INTEGER NOT NULL,
    "eventsIngested" INTEGER NOT NULL DEFAULT 0,
    "requests202" INTEGER NOT NULL DEFAULT 0,
    "requests4xx" INTEGER NOT NULL DEFAULT 0,
    "requests5xx" INTEGER NOT NULL DEFAULT 0,
    "latencyCount" INTEGER NOT NULL DEFAULT 0,
    "latencySumMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageBucket_projectId_bucketStart_idx" ON "UsageBucket"("projectId", "bucketStart");

-- CreateIndex
CREATE INDEX "UsageBucket_environmentId_bucketStart_idx" ON "UsageBucket"("environmentId", "bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "UsageBucket_environmentId_apiKeyId_bucketStart_bucketMs_key" ON "UsageBucket"("environmentId", "apiKeyId", "bucketStart", "bucketMs");
