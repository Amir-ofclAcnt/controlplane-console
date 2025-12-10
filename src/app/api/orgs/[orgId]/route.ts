import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const member = await prisma.orgMember.findFirst({
    where: { organizationId: orgId, userId: session.userId },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, slug: true, createdAt: true, updatedAt: true },
  });

  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ org });
}
