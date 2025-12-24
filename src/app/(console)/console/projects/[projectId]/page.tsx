import { auth } from "@/auth";
import { prisma as db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Key as KeyIcon,
  Flag as FlagIcon,
  Activity as ActivityIcon,
  BarChart3 as BarChart3Icon,
} from "lucide-react";

type ParamsPromise = Promise<{ projectId: string }>;

export const runtime = "nodejs";

export default async function ProjectOverviewPage({
  params,
}: {
  params: ParamsPromise;
}) {
  const { projectId } = await params;

  const session = await auth();
  if (!session?.userId) {
    // The console layout should already redirect unauthenticated users,
    // but we keep this as a safety net.
    notFound();
  }

  // Load project with environments, only if the user is a member of the org
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      organization: {
        members: {
          some: {
            userId: session.userId,
          },
        },
      },
    },
    include: {
      organization: true,
      environments: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const [apiKeyCount, flagCount, eventCount, recentEvents] = await Promise.all([
    db.apiKey.count({
      where: {
        projectId: project.id,
        revokedAt: null,
      },
    }),
    db.featureFlag.count({
      where: {
        projectId: project.id,
      },
    }),
    db.event.count({
      where: {
        projectId: project.id,
      },
    }),
    db.event.findMany({
      where: {
        projectId: project.id,
      },
      orderBy: {
        receivedAt: "desc",
      },
      take: 5,
    }),
  ]);

  const primaryEnv = project.environments[0];

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {project.organization.name} · Project overview
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {project.environments.map((env) => (
              <Badge
                key={env.id}
                variant={env.id === primaryEnv?.id ? "default" : "outline"}
                className="uppercase tracking-wide"
              >
                {env.name}
              </Badge>
            ))}
          </div>
        </div>

        <p className="max-w-2xl text-sm text-muted-foreground">
          This dashboard gives you a quick snapshot of API keys, flags, traffic
          and recent events for this project. Use the shortcuts below to jump
          into flags, API keys or logs.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active API keys</CardTitle>
            <KeyIcon className="h-4 w-4 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{apiKeyCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Non-revoked keys for this project.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Feature flags</CardTitle>
            <FlagIcon className="h-4 w-4 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{flagCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Flags defined at the project level.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Events ingested</CardTitle>
            <ActivityIcon className="h-4 w-4 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{eventCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Total events recorded for this project.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions + placeholder usage card */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>
              Jump directly into the key workflows for this project.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild size="sm">
              <Link href={`/console/projects/${project.id}/flags`}>
                <FlagIcon className="mr-2 h-4 w-4" />
                Manage flags
              </Link>
            </Button>

            <Button asChild size="sm" variant="outline">
              <Link href={`/console/projects/${project.id}/keys`}>
                <KeyIcon className="mr-2 h-4 w-4" />
                Manage API keys
              </Link>
            </Button>

            <Button asChild size="sm" variant="outline">
              <Link href={`/console/projects/${project.id}/logs`}>
                <ActivityIcon className="mr-2 h-4 w-4" />
                View logs
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage overview</CardTitle>
            <CardDescription>
              High-level traffic for the last period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Placeholder until we have real time-series usage */}
            <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
              Usage charts are coming next.
              <br />
              You will be able to see events and flag evaluations over time here.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent events</CardTitle>
            <CardDescription>
              Last few events ingested via <code className="text-xs">/v1/events</code>.
            </CardDescription>
          </div>
          <BarChart3Icon className="h-4 w-4 opacity-70" />
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events yet. Send a test request with{" "}
              <code className="text-xs">curl</code> using one of your API keys to
              see activity here.
            </p>
          ) : (
            <div className="space-y-3">
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{event.type || "event"}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-xs">
                      {event.payloadJson
                        ? JSON.stringify(event.payloadJson)
                        : "No payload"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(event.receivedAt), {
                      addSuffix: true,
                      locale: sv,
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
