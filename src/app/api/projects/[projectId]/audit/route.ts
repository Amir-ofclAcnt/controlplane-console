import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const takeSchema = z
  .string()
  .optional()
  .transform((v) => {
    const n = v ? Number(v) : 50;
    if (!Number.isFinite(n)) return 50;
    return Math.max(1, Math.min(200, n));
  });

const optionalTrim = () =>
  z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim();
      return t && t.length > 0 ? t : undefined;
    });

const QuerySchema = z.object({
  take: takeSchema,
  cursor: optionalTrim(), // AuditLog.id
  actorUserId: optionalTrim(),
  action: optionalTrim(),
  targetType: optionalTrim(),
  targetId: optionalTrim(),
  q: z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim();
      return t && t.length > 0 ? t : undefined;
    })
    .refine((v) => v === undefined || v.length <= 200, {
      message: "q must be <= 200 characters",
    }),
});

function iso(d: Date) {
  return d.toISOString();
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  // 1) Auth
  const session = await auth();
  const userId = session?.userId;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Authorization: user must belong to org that owns the project
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: { members: { some: { userId } } },
    },
    select: { id: true, organizationId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 3) Parse query
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    take: url.searchParams.get("take") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    actorUserId: url.searchParams.get("actorUserId") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    targetType: url.searchParams.get("targetType") ?? undefined,
    targetId: url.searchParams.get("targetId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { take, cursor, actorUserId, action, targetType, targetId, q } =
    parsed.data;

  // 4) Filters
  const where: Prisma.AuditLogWhereInput = {
    organizationId: project.organizationId,
    ...(actorUserId ? { actorUserId } : {}),
    ...(action ? { action } : {}),
    ...(targetType ? { targetType } : {}),
    ...(targetId ? { targetId } : {}),
  };

  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { targetType: { contains: q, mode: "insensitive" } },
      { targetId: { contains: q, mode: "insensitive" } },
    ];
  }

  // 5) Cursor pagination (newest first)
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      organizationId: true,
      actorUserId: true,
      action: true,
      targetType: true,
      targetId: true,
      metaJson: true,
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  return NextResponse.json({
    projectId,
    organizationId: project.organizationId,
    items: items.map((r) => ({
      ...r,
      createdAt: iso(r.createdAt),
    })),
    nextCursor,
  });
}
