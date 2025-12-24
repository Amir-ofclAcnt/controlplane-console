import { prisma } from "@/lib/db";

function floorToHour(d: Date) {
  const t = d.getTime();
  return new Date(Math.floor(t / 3_600_000) * 3_600_000);
}

export async function bumpUsage(params: {
  projectId: string;
  environmentId: string;
  apiKeyId?: string | null; // optional
  status: number | string; // accept both, normalize
  latencyMs?: number | null;
  eventsIngested?: number; // how many events inserted
  at?: Date; // default now
}) {
  const {
    projectId,
    environmentId,
    apiKeyId = null,
    status,
    latencyMs = null,
    eventsIngested = 0,
    at = new Date(),
  } = params;

  const statusCode = typeof status === "string" ? Number(status) : status;

  const requests202 = statusCode === 202 ? 1 : 0;
  const requests4xx = statusCode >= 400 && statusCode < 500 ? 1 : 0;
  const requests5xx = statusCode >= 500 ? 1 : 0;

  const bucketStart = floorToHour(at);

  const scopeKey = apiKeyId ? `apiKey:${apiKeyId}` : "project";

  const latencyCount = typeof latencyMs === "number" ? 1 : 0;
  const latencySum =
    typeof latencyMs === "number" ? Math.max(0, Math.round(latencyMs)) : 0;

  await prisma.usageBucket.upsert({
    where: {
      project_env_scope_bucket: {
        projectId,
        environmentId,
        scopeKey,
        bucketStart,
      },
    },
    create: {
      projectId,
      environmentId,
      scopeKey,
      bucketStart,
      eventsIngested,
      requests202,
      requests4xx,
      requests5xx,
      latencySum,
      latencyCount,
    },
    update: {
      eventsIngested: { increment: eventsIngested },
      requests202: { increment: requests202 },
      requests4xx: { increment: requests4xx },
      requests5xx: { increment: requests5xx },
      latencySum: { increment: latencySum },
      latencyCount: { increment: latencyCount },
    },
  });
}
