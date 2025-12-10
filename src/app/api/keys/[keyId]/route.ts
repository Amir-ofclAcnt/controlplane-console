import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// DELETE /api/keys/:keyId  -> revoke (sets revokedAt)
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ keyId: string }> }
) {
  const { keyId } = await ctx.params;

  const session = await getServerSession(authOptions);
  const userId = session?.userId;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Load key + org for authorization
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: keyId },
    select: {
      id: true,
      name: true,
      prefix: true,
      revokedAt: true,
      environmentId: true,
      project: {
        select: {
          id: true,
          organizationId: true,
        },
      },
    },
  });

  if (!apiKey) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Membership check via org
  const member = await prisma.orgMember.findFirst({
    where: {
      organizationId: apiKey.project.organizationId,
      userId,
    },
    select: { role: true },
  });

  if (!member) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Idempotent revoke
  if (apiKey.revokedAt) {
    return NextResponse.json(
      {
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          prefix: apiKey.prefix,
          revokedAt: apiKey.revokedAt,
          environmentId: apiKey.environmentId,
          projectId: apiKey.project.id,
        },
      },
      { status: 200 }
    );
  }

  const updated = await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
    select: {
      id: true,
      name: true,
      prefix: true,
      revokedAt: true,
      lastUsedAt: true,
      environmentId: true,
      projectId: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: apiKey.project.organizationId,
      actorUserId: userId,
      action: "apikey.revoke",
      targetType: "apiKey",
      targetId: updated.id,
      metaJson: {
        projectId: updated.projectId,
        environmentId: updated.environmentId,
        prefix: updated.prefix,
        name: updated.name,
      },
    },
  });

  return NextResponse.json({ apiKey: updated }, { status: 200 });
}
