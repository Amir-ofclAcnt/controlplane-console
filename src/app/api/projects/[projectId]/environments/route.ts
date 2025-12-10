import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // membership via project -> org -> orgMember
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const member = await prisma.orgMember.findFirst({
    where: { organizationId: project.organizationId, userId: session.userId },
    select: { role: true },
  });
  if (!member) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const environments = await prisma.environment.findMany({
    where: { projectId },
    orderBy: [{ slug: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  return NextResponse.json({ environments });
}
