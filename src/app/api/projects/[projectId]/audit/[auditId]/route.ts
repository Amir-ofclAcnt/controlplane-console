import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function iso(d: Date) {
  return d.toISOString();
}

// GET /api/projects/:projectId/audit/:auditId
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string; auditId: string }> }
) {
  const { projectId, auditId } = await ctx.params;

  // 1) Auth
  const session = await auth();
  const userId = session?.userId;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) AuthZ: must be org member of this project
  const project = await prisma.project.findFirst({
    where: { id: projectId, organization: { members: { some: { userId } } } },
    select: { id: true, organizationId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 3) Fetch single audit entry by ID, scoped to org + project
  const row = await prisma.auditLog.findFirst({
    where: {
      id: auditId,
      organizationId: project.organizationId,
      projectId: project.id,
    },
    select: {
      id: true,
      createdAt: true,
      organizationId: true,
      projectId: true,
      environmentId: true,
      actorUserId: true,
      action: true,
      targetType: true,
      targetId: true,
      metaJson: true,
      actor: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      projectId: project.id,
      organizationId: project.organizationId,
      item: { ...row, createdAt: iso(row.createdAt) },
    },
    { status: 200 }
  );
}
