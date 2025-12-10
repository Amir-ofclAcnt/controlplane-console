import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { buildEnvironmentSnapshot } from "@/lib/snapshots";

export const runtime = "nodejs";

// POST /api/environments/:environmentId/publish
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ environmentId: string }> }
) {
  const { environmentId } = await ctx.params;

  const session = await getServerSession(authOptions);
  const userId = session?.userId;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Load env -> org for authz
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
    where: { organizationId: env.project.organizationId, userId },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const built = await buildEnvironmentSnapshot(environmentId);
  if (!built) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await prisma.$transaction(async (tx) => {
    const latest = await tx.configSnapshot.findFirst({
      where: { environmentId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const nextVersion = (latest?.version ?? 0) + 1;

    // Optional: avoid duplicating identical content (you have @@unique([environmentId, contentSha256]))
    const existing = await tx.configSnapshot.findFirst({
      where: { environmentId, contentSha256: built.contentSha256 },
      select: { id: true, version: true, status: true },
    });

    if (existing) {
      // If identical content already exists, treat this as idempotent “publish”
      // (You can tighten semantics later.)
      return await tx.configSnapshot.update({
        where: { id: existing.id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
        select: {
          id: true,
          environmentId: true,
          version: true,
          status: true,
          contentSha256: true,
          createdAt: true,
          publishedAt: true,
        },
      });
    }

    const snapshot = await tx.configSnapshot.create({
      data: {
        environmentId,
        version: nextVersion,
        status: "PUBLISHED",
        contentJson: built.contentJson,
        contentSha256: built.contentSha256,
        createdByUserId: userId,
        publishedAt: new Date(),
      },
      select: {
        id: true,
        environmentId: true,
        version: true,
        status: true,
        contentSha256: true,
        createdAt: true,
        publishedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: env.project.organizationId,
        actorUserId: userId,
        action: "snapshot.publish",
        targetType: "environment",
        targetId: environmentId,
        metaJson: {
          environmentId,
          projectId: env.projectId,
          version: snapshot.version,
          contentSha256: snapshot.contentSha256,
        },
      },
    });

    return snapshot;
  });

  return NextResponse.json({ snapshot: result }, { status: 201 });
}
