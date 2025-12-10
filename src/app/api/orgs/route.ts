import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(80),
});

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orgs = await prisma.organization.findMany({
    where: { members: { some: { userId: session.userId } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  return NextResponse.json({ orgs });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = CreateOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const baseSlug = slugify(parsed.data.name);
  const slug =
    baseSlug.length > 0
      ? `${baseSlug}-${Math.random().toString(16).slice(2, 8)}`
      : `org-${Date.now()}`;

  const org = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      slug,
      members: {
        create: {
          userId: session.userId,
          role: "OWNER",
        },
      },
    },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  return NextResponse.json({ org }, { status: 201 });
}
