import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ environmentId: string; flagId: string }> }
) {
  const { environmentId, flagId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const env = await prisma.environment.findUnique({
    where: { id: environmentId },
    select: {
      id: true,
      projectId: true,
      project: { select: { organizationId: true } },
    },
  });
  if (!env) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const member = await prisma.orgMember.findFirst({
    where: {
      organizationId: env.project.organizationId,
      userId: session.userId,
    },
    select: { role: true },
  });
  if (!member)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // ensure flag belongs to same project as env
  const flag = await prisma.featureFlag.findUnique({
    where: { id: flagId },
    select: { id: true, projectId: true },
  });
  if (!flag) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (flag.projectId !== env.projectId)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const state = await prisma.flagEnvironmentState.upsert({
    where: { flagId_environmentId: { flagId, environmentId } },
    create: { flagId, environmentId, enabled: parsed.data.enabled ?? false },
    update: {
      ...(parsed.data.enabled !== undefined
        ? { enabled: parsed.data.enabled }
        : {}),
    },
    select: {
      flagId: true,
      environmentId: true,
      enabled: true,
      updatedAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: env.project.organizationId,
      actorUserId: session.userId,
      action: "flag.env.update",
      targetType: "flagEnvironmentState",
      targetId: `${flagId}:${environmentId}`,
      metaJson: { environmentId, flagId, ...parsed.data },
    },
  });

  return NextResponse.json({ state }, { status: 200 });
}
