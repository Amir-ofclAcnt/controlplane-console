import { prisma } from "@/lib/db";

export type RateLimitResult =
  | { ok: true; limit: number; remaining: number; resetAt: Date }
  | {
      ok: false;
      limit: number;
      remaining: number;
      resetAt: Date;
      retryAfterSeconds: number;
    };

function floorToWindow(nowMs: number, windowMs: number) {
  return Math.floor(nowMs / windowMs) * windowMs;
}

export async function checkRateLimit(params: {
  apiKeyId: string;
  limit: number; // requests per window
  windowMs: number; // e.g. 60_000
}): Promise<RateLimitResult> {
  const { apiKeyId, limit, windowMs } = params;

  const now = Date.now();
  const windowStartMs = floorToWindow(now, windowMs);
  const windowStart = new Date(windowStartMs);
  const resetAt = new Date(windowStartMs + windowMs);

  // Best-effort cleanup to keep table small
  prisma.rateLimitCounter
    .deleteMany({
      where: {
        apiKeyId,
        windowStart: { lt: new Date(windowStartMs - 2 * windowMs) },
      },
    })
    .catch(() => {});

  // Atomic increment per (apiKeyId, windowStart)
  const row = await prisma.rateLimitCounter.upsert({
    where: { apiKeyId_windowStart: { apiKeyId, windowStart } },
    create: { apiKeyId, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  const remaining = Math.max(0, limit - row.count);

  if (row.count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((resetAt.getTime() - now) / 1000)
    );

    return {
      ok: false,
      limit,
      remaining,
      resetAt,
      retryAfterSeconds,
    };
  }

  return { ok: true, limit, remaining, resetAt };
}
