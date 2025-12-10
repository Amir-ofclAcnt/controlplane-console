import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import crypto from "crypto";

export const runtime = "nodejs";

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
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, organizationId: true },
  });

  if (!project) {
    return { ok: false as const, status: 404 as const, error: "not_found" };
  }

  const member = await prisma.orgMember.findFirst({
    where: { organizationId: project.organizationId, userId },
    select: { role: true },
  });

  if (!member) {
    return { ok: false as const, status: 403 as const, error: "forbidden" };
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
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      revokedAt: true,
      lastUsedAt: true,
      environmentId: true,
    },
  });

  return NextResponse.json({ apiKeys });
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
  const prefix = `cp_${randomToken(6)}`; // public identifier
  const secret = `cpk_${randomToken(24)}`; // returned once
  const hash = sha256(secret);

  try {
    const apiKey = await prisma.apiKey.create({
      data: {
        projectId,
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
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: authz.project.organizationId,
        actorUserId: userId,
        action: "apikey.create",
        targetType: "apiKey",
        targetId: apiKey.id,
        metaJson: {
          projectId,
          environmentId: envCheck.env.id,
          envSlug: envCheck.env.slug,
          prefix: apiKey.prefix,
          name: apiKey.name,
        },
      },
    });

    return NextResponse.json(
      {
        apiKey,
        secret,
        authorizationHeader: `Authorization: Bearer ${secret}`,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    // If the prefix unique constraint ever collides, retry once (rare but possible)
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: "internal_error", message: msg },
      { status: 500 }
    );
  }
}
