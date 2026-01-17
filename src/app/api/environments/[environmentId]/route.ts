import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  slug: z.string().trim().min(1).max(80).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ environmentId: string }> }
) {
  const { environmentId } = await ctx.params;

  const session = await auth();
  const userId = session?.userId;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const patch = parsed.data;
  if (!patch.name && !patch.slug) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const env = await tx.environment.findFirst({
      where: {
        id: environmentId,
        project: { organization: { members: { some: { userId } } } },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        projectId: true,
        project: { select: { organizationId: true } },
      },
    });

    if (!env) return null;

    const after = await tx.environment.update({
      where: { id: environmentId },
      data: patch,
      select: { id: true, name: true, slug: true },
    });

    await writeAudit(tx, {
      organizationId: env.project.organizationId,
      projectId: env.projectId,
      environmentId: env.id,
      actorUserId: userId,
      action: "environment.updated",
      targetType: "environment",
      targetId: env.id,
      metaJson: {
        projectId: env.projectId,
        environmentId: env.id,
        before: { name: env.name, slug: env.slug },
        after: { name: after.name, slug: after.slug },
      },
    });

    return after;
  });

  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ environment: updated });
}
