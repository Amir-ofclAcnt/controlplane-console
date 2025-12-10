import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/apiKeyAuth";
import { z } from "zod";

export const runtime = "nodejs";

type InputJson = Parameters<
  typeof prisma.event.create
>[0]["data"]["payloadJson"];

const EventSchema = z
  .object({
    type: z.string().min(1).max(80).optional(),
    payload: z.unknown().optional(),
  })
  .passthrough();

export async function POST(req: Request) {
  const start = Date.now();

  const auth = await requireApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { apiKey } = auth;

  // Cast to Prisma JSON input type (Zod passthrough uses `unknown`)
  const payloadJson = parsed.data as unknown as InputJson;

  try {
    await prisma.event.create({
      data: {
        projectId: apiKey.projectId,
        environmentId: apiKey.environmentId,
        apiKeyId: apiKey.id,
        type: parsed.data.type ?? null,
        payloadJson,
      },
    });

    const latencyMs = Date.now() - start;
    await prisma.requestLog.create({
      data: {
        projectId: apiKey.projectId,
        environmentId: apiKey.environmentId,
        apiKeyId: apiKey.id,
        method: "POST",
        path: "/v1/events",
        status: 202,
        latencyMs,
        ip: req.headers.get("x-forwarded-for"),
        userAgent: req.headers.get("user-agent"),
      },
    });

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;

    prisma.requestLog
      .create({
        data: {
          projectId: apiKey.projectId,
          environmentId: apiKey.environmentId,
          apiKeyId: apiKey.id,
          method: "POST",
          path: "/v1/events",
          status: 500,
          latencyMs,
          ip: req.headers.get("x-forwarded-for"),
          userAgent: req.headers.get("user-agent"),
        },
      })
      .catch(() => {});

    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: "internal_error", message: msg },
      { status: 500 }
    );
  }
}
