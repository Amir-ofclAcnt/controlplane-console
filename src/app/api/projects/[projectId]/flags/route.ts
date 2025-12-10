import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const CreateFlagSchema = z.object({
  key: z.string().min(2).max(80).regex(/^[a-z0-9][a-z0-9_.-]*$/i),
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
  if (!session?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const authz = await requireProjectMembership(projectId, session.userId);
  if (!authz.ok) return NextResponse.json({ error: authz.status === 404 ? "not_found" : "forbidden" }, { status: authz.status });

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
      states: envId
        ? {
            where: { environmentId: envId },
            select: { enabled: true, valueBool: true, updatedAt: true },
          }
        : false,
    },
  });

  const shaped = flags.map((f) => ({
    ...f,
    state: envId ? (f.states?.[0] ?? null) : null,
    states: undefined,
  }));

  return NextResponse.json({ flags: shaped });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const authz = await requireProjectMembership(projectId, session.userId);
  if (!authz.ok) return NextResponse.json({ error: authz.status === 404 ? "not_found" : "forbidden" }, { status: authz.status });

  const body = await req.json().catch(() => null);
  const parsed = CreateFlagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }

  const envs = await prisma.environment.findMany({
    where: { projectId },
    select: { id: true },
  });

  const created = await prisma.$transaction(async (tx: Tx) => {
    const flag = await tx.featureFlag.create({
      data: { projectId, key: parsed.data.key, name: parsed.data.name },
      select: { id: true, key: true, name: true, kind: true, lifecycle: true, createdAt: true, updatedAt: true },
    });

    if (envs.length > 0) {
      await tx.flagState.createMany({
        data: envs.map((e) => ({
          flagId: flag.id,
          environmentId: e.id,
          enabled: false,
          valueBool: false,
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
