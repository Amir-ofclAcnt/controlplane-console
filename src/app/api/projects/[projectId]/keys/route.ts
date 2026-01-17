import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import crypto from "crypto";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const CreateKeySchema = z.object({
  name: z.string().min(2).max(80),
  environmentId: z.string().min(1),
});

function randomToken(bytes: number) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function requireSessionUserId() {
  const session = await getServerSession(authOptions);
  const userId = session?.userId;
  return userId ?? null;
}

async function requireProjectAndMembership(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: { members: { some: { userId } } },
    },
    select: { id: true, organizationId: true },
  });

  if (!project) {
    return { ok: false as const, status: 404 as const, error: "not_found" };
  }

  return { ok: true as const, project };
}

async function requireEnvironmentInProject(
  environmentId: string,
  projectId: string
) {
  const env = await prisma.environment.findFirst({
    where: { id: environmentId, projectId },
    select: { id: true, slug: true, name: true },
  });

  if (!env) {
    return {
      ok: false as const,
      status: 400 as const,
      error: "invalid_environment",
    };
  }

  return { ok: true as const, env };
}

// GET /api/projects/:projectId/keys?envId=...
export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  const userId = await requireSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const authz = await requireProjectAndMembership(projectId, userId);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const url = new URL(req.url);
  const envId = url.searchParams.get("envId")?.trim() ?? "";

  if (!envId) {
    return NextResponse.json({ error: "envId_required" }, { status: 400 });
  }

  const envCheck = await requireEnvironmentInProject(envId, projectId);
  if (!envCheck.ok) {
    return NextResponse.json(
      { error: envCheck.error },
      { status: envCheck.status }
    );
  }

  const apiKeys = await prisma.apiKey.findMany({
    where: {
      projectId,
      environmentId: envId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      revokedAt: true,
      lastUsedAt: true,
      environmentId: true,
      projectId: true,
      createdByUserId: true,
    },
  });

  return NextResponse.json({ apiKeys }, { status: 200 });
}

// POST /api/projects/:projectId/keys
export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  const userId = await requireSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const authz = await requireProjectAndMembership(projectId, userId);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const envCheck = await requireEnvironmentInProject(
    parsed.data.environmentId,
    projectId
  );
  if (!envCheck.ok) {
    return NextResponse.json(
      { error: envCheck.error },
      { status: envCheck.status }
    );
  }

  // Secret shown once. Hash stored only.
  const prefix = `cp_${randomToken(6)}`;
  const secret = `cpk_${randomToken(24)}`;
  const hash = sha256(secret);

  const created = await prisma.$transaction(async (tx: Tx) => {
    const apiKey = await tx.apiKey.create({
      data: {
        projectId: authz.project.id,
        environmentId: envCheck.env.id,
        name: parsed.data.name,
        prefix,
        hash,
        createdByUserId: userId,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
        revokedAt: true,
        lastUsedAt: true,
        environmentId: true,
        projectId: true,
      },
    });

    await writeAudit(tx, {
      organizationId: authz.project.organizationId,
      projectId: authz.project.id,
      environmentId: envCheck.env.id,
      actorUserId: userId,
      action: "api_key.created",
      targetType: "api_key",
      targetId: apiKey.id,
      metaJson: {
        projectId: authz.project.id,
        environmentId: envCheck.env.id,
        apiKeyId: apiKey.id,
        name: apiKey.name ?? null,
        prefix: apiKey.prefix,
        environment: {
          id: envCheck.env.id,
          slug: envCheck.env.slug,
          name: envCheck.env.name,
        },
      },
    });

    return apiKey;
  });

  return NextResponse.json(
    {
      apiKey: created,
      secret,
      authorizationHeader: `Authorization: Bearer ${secret}`,
    },
    { status: 201 }
  );
}
