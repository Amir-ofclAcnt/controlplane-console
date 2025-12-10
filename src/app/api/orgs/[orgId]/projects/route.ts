import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const CreateProjectSchema = z.object({
  name: z.string().min(2).max(80),
});

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

  const projects = await prisma.project.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  return NextResponse.json({ projects });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await ctx.params;

  try {
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

    const body = await req.json().catch(() => null);
    const parsed = CreateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const baseSlug = slugify(parsed.data.name);
    const slug = baseSlug
      ? `${baseSlug}-${Math.random().toString(16).slice(2, 8)}`
      : `proj-${Date.now()}`;

    // Transaction: create project + envs + audit entries
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId: orgId,
          name: parsed.data.name,
          slug,
        },
        select: { id: true, name: true, slug: true, createdAt: true },
      });

      const envs = await tx.environment.createMany({
        data: [
          { projectId: project.id, name: "Development", slug: "dev" },
          { projectId: project.id, name: "Staging", slug: "staging" },
          { projectId: project.id, name: "Production", slug: "prod" },
        ],
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorUserId: session.userId,
          action: "project.create",
          targetType: "project",
          targetId: project.id,
          metaJson: {
            project: { id: project.id, name: project.name, slug: project.slug },
            environmentsCreated: envs.count,
          },
        },
      });

      return project;
    });

    return NextResponse.json({ project: result }, { status: 201 });
  } catch (err: unknown) {
    console.error("Create project failed:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: "internal_error", message },
      { status: 500 }
    );
  }
}
