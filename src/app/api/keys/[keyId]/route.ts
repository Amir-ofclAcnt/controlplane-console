import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ keyId: string }> }
) {
  const { keyId } = await ctx.params;

  const session = await getServerSession(authOptions);
  const userId = session?.userId;
  if (!userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = await prisma.apiKey.findUnique({
    where: { id: keyId },
    select: {
      id: true,
      name: true,
      prefix: true,
      revokedAt: true,
      environmentId: true,
      projectId: true,
      project: { select: { organizationId: true } },
    },
  });
  if (!key) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const member = await prisma.orgMember.findFirst({
    where: { organizationId: key.project.organizationId, userId },
    select: { role: true },
  });
  if (!member)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // idempotent
  if (key.revokedAt) {
    return NextResponse.json(
      {
        apiKey: {
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          revokedAt: key.revokedAt,
          environmentId: key.environmentId,
          projectId: key.projectId,
        },
      },
      { status: 200 }
    );
  }

  const updated = await prisma.$transaction(async (tx: Tx) => {
    const u = await tx.apiKey.update({
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

    await writeAudit(tx, {
      organizationId: key.project.organizationId,
      actorUserId: userId,

      projectId: u.projectId,
      environmentId: u.environmentId,

      action: "api_key.revoked",
      kind: "api_key",
      targetType: "api_key",
      targetId: u.id,
      metaJson: {
        apiKeyId: u.id,
        name: u.name ?? null,
        prefix: u.prefix ?? null,
      },
    });

    return u;
  });

  return NextResponse.json({ apiKey: updated }, { status: 200 });
}
