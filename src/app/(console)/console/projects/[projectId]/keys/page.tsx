import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

import { KeyGenerator } from "./KeyGenerator";
import { revokeApiKeyAction } from "./actions";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const runtime = "nodejs";

type ParamsPromise = Promise<{ projectId: string }>;

export default async function ProjectKeysPage({ params }: { params: ParamsPromise }) {
  const { projectId } = await params;

  const session = await auth();
  if (!session?.userId) notFound();

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: { members: { some: { userId: session.userId } } },
    },
    select: {
      id: true,
      name: true,
      environments: {
        select: { id: true, name: true, slug: true },
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
      environmentId: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  const envById = new Map(project.environments.map((e) => [e.id, e]));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="space-y-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Generate keys for SDKs and ingestion endpoints. Keys are scoped to an environment.
          </p>
          <p className="text-sm text-muted-foreground">
            Project ID: <span className="font-mono">{project.id}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/console/projects/${project.id}`}
            className="inline-block rounded border px-3 py-2 text-sm hover:bg-muted"
          >
            Back to Project
          </Link>

          {/* Optional: show project name */}
          <span className="text-sm text-muted-foreground">
            Project: <span className="font-medium text-foreground">{project.name}</span>
          </span>
        </div>
      </div>

      {/* Key generator */}
      <KeyGenerator projectId={project.id} environments={project.environments} />

      {/* Existing keys */}
      <Card>
        <CardHeader>
          <CardTitle>Existing keys</CardTitle>
          <CardDescription>
            Only the prefix is stored and displayed. The secret is shown only once at creation time.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No keys yet.</p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => {
                const env = k.environmentId ? envById.get(k.environmentId) : null;
                const revoked = Boolean(k.revokedAt);

                return (
                  <div key={k.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate font-medium">{k.name}</div>

                        {revoked ? (
                          <Badge variant="destructive">Revoked</Badge>
                        ) : (
                          <Badge variant="outline">Active</Badge>
                        )}

                        {env ? (
                          <Badge variant="secondary">{env.name}</Badge>
                        ) : (
                          <Badge variant="outline">No env</Badge>
                        )}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        Prefix: <code>{k.prefix}</code> · Created: {k.createdAt.toISOString().slice(0, 10)}
                        {k.lastUsedAt ? ` · Last used: ${k.lastUsedAt.toISOString().slice(0, 10)}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!revoked ? (
                        <form action={revokeApiKeyAction}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="apiKeyId" value={k.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Revoke
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
