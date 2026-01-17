import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

const CreateEnvironmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((v) => normalizeSlug(v))
    .refine((v) => /^[a-z0-9-]+$/.test(v), {
      message: "slug must be lowercase letters/numbers/dashes",
    }),
});

async function requireSessionUserId() {
  const session = await getServerSession(authOptions);
  return session?.userId ?? null;
}

async function requireProjectAndMembership(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: { members: { some: { userId } } },
    },
    select: { id: true, organizationId: true },
  });

  if (!project) {
    // Return 404 here (avoids leaking existence)
    return { ok: false as const, status: 404 as const, error: "not_found" };
  }

  return { ok: true as const, project };
}

// GET /api/projects/:projectId/environments
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  const userId = await requireSessionUserId();
  if (!userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const authz = await requireProjectAndMembership(projectId, userId);
  if (!authz.ok)
    return NextResponse.json({ error: authz.error }, { status: authz.status });

  const environments = await prisma.environment.findMany({
    where: { projectId },
    orderBy: [{ slug: "asc" }, { name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      projectId: true,
    },
  });

  return NextResponse.json({ environments }, { status: 200 });
}

// POST /api/projects/:projectId/environments
export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  const userId = await requireSessionUserId();
  if (!userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const authz = await requireProjectAndMembership(projectId, userId);
  if (!authz.ok)
    return NextResponse.json({ error: authz.error }, { status: authz.status });

  const body = await req.json().catch(() => null);
  const parsed = CreateEnvironmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Enforce slug uniqueness within project (even if DB constraint not added yet)
  const existing = await prisma.environment.findFirst({
    where: { projectId: authz.project.id, slug: parsed.data.slug },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: "slug_taken",
        message: "Environment slug already exists in this project.",
      },
      { status: 409 }
    );
  }

  try {
    const env = await prisma.$transaction(async (tx: Tx) => {
      const created = await tx.environment.create({
        data: {
          projectId: authz.project.id,
          name: parsed.data.name,
          slug: parsed.data.slug,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          projectId: true,
        },
      });

      await writeAudit(tx, {
        organizationId: authz.project.organizationId,
        projectId: authz.project.id,
        environmentId: created.id,
        actorUserId: userId,
        action: "environment.created",
        targetType: "environment",
        targetId: created.id,
        metaJson: {
          projectId: authz.project.id,
          environmentId: created.id,
          name: created.name,
          slug: created.slug,
        },
      });

      return created;
    });

    return NextResponse.json({ environment: env }, { status: 201 });
  } catch (err: unknown) {
    const isUnique =
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002";

    return NextResponse.json(
      { error: isUnique ? "conflict" : "internal_error" },
      { status: isUnique ? 409 : 500 }
    );
  }
}
