import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import KeyGenerator from "./KeyGenerator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProjectKeysPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const session = await auth();
  const userId = session?.userId;
  if (!userId) notFound();

  // Ensure user is a member of the org that owns the project
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: {
        members: { some: { userId } },
      },
    },
    select: {
      id: true,
      name: true,
      environments: {
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!project) notFound();

  const keys = await prisma.apiKey.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      revokedAt: true,
      environment: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Project: <span className="font-mono">{project.name}</span>
          </p>
        </div>

        <Link
          href={`/console/projects/${projectId}`}
          className="inline-block rounded border px-3 py-2 text-sm hover:bg-muted"
        >
          Back to Project
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manage keys</CardTitle>
          <CardDescription>
            Keys are shown by prefix only. The full secret is displayed once on
            create/rotate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeyGenerator
            projectId={project.id}
            environments={project.environments}
            keys={keys}
          />
        </CardContent>
      </Card>
    </div>
  );
}
