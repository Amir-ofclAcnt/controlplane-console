-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimitCounter_apiKeyId_windowStart_idx" ON "RateLimitCounter"("apiKeyId", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitCounter_apiKeyId_windowStart_key" ON "RateLimitCounter"("apiKeyId", "windowStart");

-- AddForeignKey
ALTER TABLE "RateLimitCounter" ADD CONSTRAINT "RateLimitCounter_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
