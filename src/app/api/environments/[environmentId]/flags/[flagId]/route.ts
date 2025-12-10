import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  valueBool: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ environmentId: string; flagId: string }> }
) {
  const { environmentId, flagId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const env = await prisma.environment.findUnique({
    where: { id: environmentId },
    select: { id: true, projectId: true, project: { select: { organizationId: true } } },
  });
  if (!env) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const member = await prisma.orgMember.findFirst({
    where: { organizationId: env.project.organizationId, userId: session.userId },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }

  const state = await prisma.flagState.upsert({
    where: { flagId_environmentId: { flagId, environmentId } },
    create: {
      flagId,
      environmentId,
      enabled: parsed.data.enabled ?? false,
      valueBool: parsed.data.valueBool ?? false,
    },
    update: {
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.valueBool !== undefined ? { valueBool: parsed.data.valueBool } : {}),
    },
    select: { flagId: true, environmentId: true, enabled: true, valueBool: true, updatedAt: true },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: env.project.organizationId,
      actorUserId: session.userId,
      action: "flagstate.update",
      targetType: "flagState",
      targetId: `${flagId}:${environmentId}`,
      metaJson: { environmentId, flagId, ...parsed.data },
    },
  });

  return NextResponse.json({ state }, { status: 200 });
}
