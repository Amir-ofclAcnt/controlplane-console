import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const CreateFlagSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9_.-]*$/i),
  name: z.string().min(2).max(120),
});

async function requireProjectMembership(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, organizationId: true },
  });
  if (!project) return { ok: false as const, status: 404 as const };

  const member = await prisma.orgMember.findFirst({
    where: { organizationId: project.organizationId, userId },
    select: { role: true },
  });
  if (!member) return { ok: false as const, status: 403 as const };

  return { ok: true as const, project };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const authz = await requireProjectMembership(projectId, session.userId);
  if (!authz.ok) {
    return NextResponse.json(
      { error: authz.status === 404 ? "not_found" : "forbidden" },
      { status: authz.status }
    );
  }

  const url = new URL(req.url);
  const envId = url.searchParams.get("envId");

  const flags = await prisma.featureFlag.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      key: true,
      name: true,
      kind: true,
      lifecycle: true,
      createdAt: true,
      updatedAt: true,
      envStates: envId
        ? {
            where: { environmentId: envId },
            select: { enabled: true, updatedAt: true },
            take: 1,
          }
        : false,
    },
  });

  const shaped = flags.map((f) => {
    const state =
      envId && Array.isArray(f.envStates) ? f.envStates[0] ?? null : null;

    return {
      id: f.id,
      key: f.key,
      name: f.name,
      kind: f.kind,
      lifecycle: f.lifecycle,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      state,
    };
  });

  return NextResponse.json({ flags: shaped });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const authz = await requireProjectMembership(projectId, session.userId);
  if (!authz.ok) {
    return NextResponse.json(
      { error: authz.status === 404 ? "not_found" : "forbidden" },
      { status: authz.status }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateFlagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const envs = await prisma.environment.findMany({
    where: { projectId },
    select: { id: true },
  });

  const created = await prisma.$transaction(async (tx: Tx) => {
    // 1) Create flag
    const flag = await tx.featureFlag.create({
      data: { projectId, key: parsed.data.key, name: parsed.data.name },
      select: {
        id: true,
        key: true,
        name: true,
        kind: true,
        lifecycle: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 2) Create default BOOLEAN variations: false (order 0), true (order 1)
    const vFalse = await tx.flagVariation.create({
      data: {
        flagId: flag.id,
        order: 0,
        name: "False",
        value: false,
      },
      select: { id: true },
    });

    const vTrue = await tx.flagVariation.create({
      data: {
        flagId: flag.id,
        order: 1,
        name: "True",
        value: true,
      },
      select: { id: true },
    });

    // 3) Create per-environment state, default OFF (enabled=false)
    if (envs.length > 0) {
      await tx.flagEnvironmentState.createMany({
        data: envs.map((e) => ({
          flagId: flag.id,
          environmentId: e.id,
          enabled: false,
          offVariationId: vFalse.id,
          fallthroughId: vTrue.id,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: authz.project.organizationId,
        actorUserId: session.userId,
        action: "flag.create",
        targetType: "featureFlag",
        targetId: flag.id,
        metaJson: { projectId, key: flag.key, name: flag.name },
      },
    });

    return flag;
  });

  return NextResponse.json({ flag: created }, { status: 201 });
}
