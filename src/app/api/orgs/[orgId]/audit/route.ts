import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const member = await prisma.orgMember.findFirst({
    where: { organizationId: orgId, userId: session.userId },
    select: { role: true },
  });

  if (!member) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const audit = await prisma.auditLog.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      metaJson: true,
      createdAt: true,
      actorUserId: true,
    },
  });

  return NextResponse.json({ audit });
}
