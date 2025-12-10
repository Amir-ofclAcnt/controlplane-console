import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { z } from "zod";

export const runtime = "nodejs";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const RotateSchema = z.object({
  revokeOld: z.boolean().optional().default(true),
  name: z.string().min(2).max(80).optional(), // optional new key name
});

function randomToken(bytes: number) {
  return crypto.randomBytes(bytes).toString("base64url");
}
function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ keyId: string }> }
) {
  const { keyId } = await ctx.params;

  const session = await getServerSession(authOptions);
  const userId = session?.userId;
  if (!userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = RotateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const oldKey = await prisma.apiKey.findUnique({
    where: { id: keyId },
    select: {
      id: true,
      name: true,
      prefix: true,
      revokedAt: true,
      projectId: true,
      environmentId: true,
      project: { select: { organizationId: true } },
    },
  });
  if (!oldKey)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const member = await prisma.orgMember.findFirst({
    where: { organizationId: oldKey.project.organizationId, userId },
    select: { role: true },
  });
  if (!member)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!oldKey.environmentId) {
    return NextResponse.json(
      { error: "key_missing_environment" },
      { status: 400 }
    );
  }

  const prefix = `cp_${randomToken(6)}`;
  const secret = `cpk_${randomToken(24)}`;
  const hash = sha256(secret);

  const result = await prisma.$transaction(async (tx: Tx) => {
    const newKey = await tx.apiKey.create({
      data: {
        projectId: oldKey.projectId,
        environmentId: oldKey.environmentId,
        name: parsed.data.name ?? `${oldKey.name} (rotated)`,
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
        projectId: true,
      },
    });

    let revokedOldAt: Date | null = null;

    if (parsed.data.revokeOld && !oldKey.revokedAt) {
      const revoked = await tx.apiKey.update({
        where: { id: oldKey.id },
        data: { revokedAt: new Date() },
        select: { revokedAt: true },
      });
      revokedOldAt = revoked.revokedAt;
    }

    await tx.auditLog.create({
      data: {
        organizationId: oldKey.project.organizationId,
        actorUserId: userId,
        action: "apikey.rotate",
        targetType: "apiKey",
        targetId: newKey.id,
        metaJson: {
          projectId: oldKey.projectId,
          environmentId: oldKey.environmentId,
          old: { id: oldKey.id, prefix: oldKey.prefix },
          new: { id: newKey.id, prefix: newKey.prefix },
          revokeOld: parsed.data.revokeOld,
          revokedOldAt,
        },
      },
    });

    return newKey;
  });

  return NextResponse.json(
    {
      apiKey: result,
      secret,
      authorizationHeader: `Authorization: Bearer ${secret}`,
    },
    { status: 201 }
  );
}
