import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EnvironmentsClient from "./EnvironmentsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProjectEnvironmentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const session = await auth();
  const userId = session?.userId;
  if (!userId) notFound();

  // Gate access via project -> org membership
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: { members: { some: { userId } } },
    },
    select: { id: true, name: true, organizationId: true },
  });

  if (!project) notFound();

  // Server -> Client shape: convert Date to ISO string
  const initialEnvironmentsRaw = await prisma.environment.findMany({
    where: { projectId },
    orderBy: [{ slug: "asc" }, { name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  const initialEnvironments = initialEnvironmentsRaw.map((e) => ({
    id: e.id,
    name: e.name,
    slug: e.slug, // string | null
    createdAt: e.createdAt.toISOString(), // ✅ Date -> string
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Environments
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage environments for this project (slug is the stable
            identifier).
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href={`/console/projects/${projectId}`}>Back to Project</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project environments</CardTitle>
        </CardHeader>
        <CardContent>
          <EnvironmentsClient
            projectId={projectId}
            initialEnvironments={initialEnvironments}
          />
        </CardContent>
      </Card>
    </div>
  );
}
