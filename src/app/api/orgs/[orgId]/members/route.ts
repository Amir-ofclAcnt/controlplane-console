import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const AddMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "DEVELOPER", "VIEWER"]).default("VIEWER"),
});

// GET members
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const member = await prisma.orgMember.findFirst({
    where: { organizationId: orgId, userId: session.userId },
    select: { role: true },
  });
  if (!member)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const members = await prisma.orgMember.findMany({
    where: { organizationId: orgId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      role: true,
      user: { select: { id: true, email: true, name: true, image: true } },
    },
  });

  return NextResponse.json({ members });
}

// POST add member (simple V1)
export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await ctx.params;

  const session = await getServerSession(authOptions);
  if (!session?.userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Only OWNER/ADMIN can add
  const actor = await prisma.orgMember.findFirst({
    where: { organizationId: orgId, userId: session.userId },
    select: { role: true },
  });
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (!user)
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  const created = await prisma.orgMember.upsert({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
    create: { organizationId: orgId, userId: user.id, role: parsed.data.role },
    update: { role: parsed.data.role },
    select: { id: true, role: true, userId: true, organizationId: true },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: session.userId,
      action: "member.upsert",
      targetType: "orgMember",
      targetId: created.id,
      metaJson: { email: parsed.data.email, role: parsed.data.role },
    },
  });

  return NextResponse.json({ member: created }, { status: 201 });
}
