import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/apiKeyAuth";
import { checkRateLimit } from "@/lib/rate-limit";
import { bumpUsage } from "@/lib/usage";
import { z } from "zod";

export const runtime = "nodejs";

type InputJson = Parameters<typeof prisma.event.create>[0]["data"]["payloadJson"];

const MAX_BATCH = 100;

// Accept either `type` or `name` (alias), and `payload` or `properties` (alias).
const RawEventSchema = z
  .object({
    event_id: z.string().uuid().optional(),

    type: z.string().min(1).max(80).optional(),
    name: z.string().min(1).max(80).optional(),

    payload: z.unknown().optional(),
    properties: z.unknown().optional(),

    ts: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()
  .superRefine((v, ctx) => {
    const t = v.type ?? v.name;
    if (!t) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["type"],
        message: "Either `type` or `name` is required.",
      });
    }
  });

function normalizeEvent(raw: z.infer<typeof RawEventSchema>) {
  const type = raw.type ?? raw.name ?? null;
  const payload = raw.payload ?? raw.properties;

  const eventId = raw.event_id ?? crypto.randomUUID();

  const payloadJson = {
    ...raw,
    type,
    payload,
    event_id: eventId,
  } as unknown as InputJson;

  return { eventId, type, payloadJson };
}

function getClientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  if (!xf) return null;
  return xf.split(",")[0]?.trim() ?? null;
}

export async function POST(req: Request) {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  const auth = await requireApiKey(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, request_id: requestId },
      { status: auth.status }
    );
  }

  const { apiKey } = auth;

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  // Ensure we have env for both Event insert + idempotency uniqueness + usage buckets
  if (!apiKey.environmentId) {
    const latencyMs = Date.now() - start;

    // still log request
    void prisma.requestLog
      .create({
        data: {
          projectId: apiKey.projectId,
          environmentId: apiKey.environmentId,
          apiKeyId: apiKey.id,
          requestId,
          method: "POST",
          path: "/v1/events",
          status: 403,
          latencyMs,
          ip,
          userAgent,
        },
      })
      .catch(() => {});

    return NextResponse.json(
      { error: "api_key_missing_environment", request_id: requestId },
      { status: 403 }
    );
  }

  const envId = apiKey.environmentId;

  // Unified recorder: RequestLog + UsageBucket (best-effort)
  function record(status: number, eventsIngested = 0) {
    const latencyMs = Date.now() - start;

    void prisma.requestLog
      .create({
        data: {
          projectId: apiKey.projectId,
          environmentId: envId,
          apiKeyId: apiKey.id,
          requestId,
          method: "POST",
          path: "/v1/events",
          status,
          latencyMs,
          ip,
          userAgent,
        },
      })
      .catch(() => {});

    void bumpUsage({
      projectId: apiKey.projectId,
      environmentId: envId,
      apiKeyId: apiKey.id,
      status,
      latencyMs,
      eventsIngested,
    }).catch(() => {});
  }

  const rl = await checkRateLimit({
    apiKeyId: apiKey.id,
    limit: 300,
    windowMs: 60_000,
  });

  if (!rl.ok) {
    record(429, 0);

    return NextResponse.json(
      {
        error: "rate_limited",
        request_id: requestId,
        limit: rl.limit,
        remaining: rl.remaining,
        reset_at: rl.resetAt.toISOString(),
        retry_after_seconds: rl.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "retry-after": String(rl.retryAfterSeconds),
          "x-ratelimit-limit": String(rl.limit),
          "x-ratelimit-remaining": String(rl.remaining),
          "x-ratelimit-reset": String(Math.floor(rl.resetAt.getTime() / 1000)),
        },
      }
    );
  }

  const body = await req.json().catch(() => null);
  if (body === null) {
    record(400, 0);
    return NextResponse.json(
      { error: "invalid_json", request_id: requestId },
      { status: 400 }
    );
  }

  const rawEvents = Array.isArray(body) ? body : [body];

  if (rawEvents.length === 0) {
    record(400, 0);
    return NextResponse.json(
      { error: "empty_batch", request_id: requestId },
      { status: 400 }
    );
  }

  if (rawEvents.length > MAX_BATCH) {
    record(413, 0);
    return NextResponse.json(
      { error: "batch_too_large", max: MAX_BATCH, request_id: requestId },
      { status: 413 }
    );
  }

  const parsed = z.array(RawEventSchema).safeParse(rawEvents);
  if (!parsed.success) {
    record(400, 0);
    return NextResponse.json(
      {
        error: "invalid_request",
        details: parsed.error.flatten(),
        request_id: requestId,
      },
      { status: 400 }
    );
  }

  const normalized = parsed.data.map(normalizeEvent);

  try {
    const result = await prisma.event.createMany({
      data: normalized.map((e) => ({
        projectId: apiKey.projectId,
        environmentId: envId, // guaranteed string
        apiKeyId: apiKey.id,
        eventId: e.eventId,
        type: e.type,
        payloadJson: e.payloadJson,
      })),
      skipDuplicates: true,
    });

    record(202, result.count);

    return NextResponse.json(
      {
        ok: true,
        request_id: requestId,
        received: rawEvents.length,
        inserted: result.count,
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    record(500, 0);

    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: "internal_error", message: msg, request_id: requestId },
      { status: 500 }
    );
  }
}
