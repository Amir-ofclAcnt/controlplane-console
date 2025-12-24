import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "nodejs";

type RangeKey = "6h" | "24h";

function iso(d: Date) {
  return d.toISOString();
}

function hourStart(d: Date) {
  const t = d.getTime();
  return new Date(Math.floor(t / 3_600_000) * 3_600_000);
}

function addHours(d: Date, h: number) {
  return new Date(d.getTime() + h * 3_600_000);
}

function parseRange(raw: string | null): RangeKey {
  if (raw === "6h") return "6h";
  return "24h";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  // 1) Auth
  const session = await auth();
  const userId = session?.userId;

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) AuthZ
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: { members: { some: { userId } } },
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 3) Range (default 24h)
  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get("range"));
  const hours = range === "6h" ? 6 : 24;

  // IMPORTANT: include current hour (so UI updates immediately)
  const now = new Date();
  const to = addHours(hourStart(now), 1); // next hour boundary
  const from = addHours(to, -24);

  // 4) Query buckets
  const eventsRows = await prisma.$queryRaw<
    Array<{ bucket: Date; events: number }>
  >`
    SELECT date_trunc('hour', "receivedAt") AS bucket,
           COUNT(*)::int AS events
    FROM "Event"
    WHERE "projectId" = ${projectId}
      AND "receivedAt" >= ${from}
      AND "receivedAt" < ${to}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const logsRows = await prisma.$queryRaw<
    Array<{
      bucket: Date;
      r202: number;
      r4xx: number;
      r5xx: number;
      latency_sum: number;
      latency_count: number;
    }>
  >`
    SELECT date_trunc('hour', "createdAt") AS bucket,
           COUNT(*) FILTER (WHERE "status" = 202)::int AS r202,
           COUNT(*) FILTER (WHERE "status" >= 400 AND "status" < 500)::int AS r4xx,
           COUNT(*) FILTER (WHERE "status" >= 500)::int AS r5xx,
           COALESCE(SUM("latencyMs"), 0)::int AS latency_sum,
           COUNT(*)::int AS latency_count
    FROM "RequestLog"
    WHERE "projectId" = ${projectId}
      AND "createdAt" >= ${from}
      AND "createdAt" < ${to}
      AND "path" = '/v1/events'
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const eventsMap = new Map(
    eventsRows.map((r) => [r.bucket.toISOString(), r.events])
  );
  const logsMap = new Map(
    logsRows.map((r) => [
      r.bucket.toISOString(),
      {
        r202: r.r202,
        r4xx: r.r4xx,
        r5xx: r.r5xx,
        latencySum: r.latency_sum,
        latencyCount: r.latency_count,
      },
    ])
  );

  // 5) Dense series (hours points)
  const buckets: Array<{
    bucketStart: string;
    events: number;
    requests202: number;
    requests4xx: number;
    requests5xx: number;
    avgLatencyMs: number | null;
  }> = [];

  for (let d = new Date(from); d < to; d = addHours(d, 1)) {
    const key = d.toISOString();
    const events = eventsMap.get(key) ?? 0;
    const l = logsMap.get(key);

    const requests202 = l?.r202 ?? 0;
    const requests4xx = l?.r4xx ?? 0;
    const requests5xx = l?.r5xx ?? 0;

    const avgLatencyMs =
      l && l.latencyCount > 0
        ? Math.round(l.latencySum / l.latencyCount)
        : null;

    buckets.push({
      bucketStart: key,
      events,
      requests202,
      requests4xx,
      requests5xx,
      avgLatencyMs,
    });
  }

  return NextResponse.json({
    projectId,
    range,
    from: iso(from),
    to: iso(to),
    bucket: "hour",
    buckets,
  });
}
