import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import AuditTableClient from "./AuditTableClient";

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditResponse = {
  projectId: string;
  organizationId: string;
  items: Array<{
    id: string;
    createdAt: string;
    organizationId: string;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metaJson: unknown | null;
    actor: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    } | null;
  }>;
  nextCursor: string | null;
};

function Select({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}

export default async function ProjectAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{
    cursor?: string;
    take?: string;
    actorUserId?: string;
    action?: string;
    targetType?: string;
    targetId?: string;
    q?: string;
  }>;
}) {
  const { projectId } = await params;
  const sp = (await searchParams) ?? {};

  // 1) Gate page + find orgId
  const session = await auth();
  const userId = session?.userId;
  if (!userId) notFound();

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: { members: { some: { userId } } },
    },
    select: { id: true, organizationId: true },
  });

  if (!project) notFound();

  // 2) Build "members" dropdown: OrgMember -> userIds -> Users
  const orgMembers = await prisma.orgMember.findMany({
    where: { organizationId: project.organizationId },
    select: { userId: true },
    orderBy: { userId: "asc" }, // safe + stable
  });

  const memberUserIds = Array.from(new Set(orgMembers.map((m) => m.userId)));

  const memberUsers =
    memberUserIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: memberUserIds } },
          select: { id: true, name: true, email: true },
          orderBy: [{ name: "asc" }, { email: "asc" }, { id: "asc" }],
        });

  // 2.5) Datalist suggestions for action/targetType (from org audit logs)
  const [distinctActionsRows, distinctTargetTypesRows] = await Promise.all([
    prisma.auditLog.findMany({
      where: { organizationId: project.organizationId },
      distinct: ["action"],
      select: { action: true },
      take: 200,
    }),
    prisma.auditLog.findMany({
      where: { organizationId: project.organizationId },
      distinct: ["targetType"],
      select: { targetType: true },
      take: 200,
    }),
  ]);

  const actionOptions = distinctActionsRows
    .map((r) => r.action)
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort((a, b) => a.localeCompare(b));

  const targetTypeOptions = distinctTargetTypesRows
    .map((r) => r.targetType)
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort((a, b) => a.localeCompare(b));

  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const cookie = h.get("cookie") ?? "";

  // 3) Build querystring to API
  const qs = new URLSearchParams();
  qs.set("take", sp.take?.trim() ? sp.take : "50");
  if (sp.cursor) qs.set("cursor", sp.cursor);
  if (sp.actorUserId) qs.set("actorUserId", sp.actorUserId);
  if (sp.action) qs.set("action", sp.action);
  if (sp.targetType) qs.set("targetType", sp.targetType);
  if (sp.targetId) qs.set("targetId", sp.targetId);
  if (sp.q) qs.set("q", sp.q);

  const res = await fetch(
    `${proto}://${host}/api/projects/${projectId}/audit?${qs.toString()}`,
    { headers: { cookie }, cache: "no-store" }
  );

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Failed to load audit: ${res.status}`);

  const data = (await res.json()) as AuditResponse;

  const nextQs = new URLSearchParams(qs);
  if (data.nextCursor) nextQs.set("cursor", data.nextCursor);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Audit</h1>
            <p className="text-sm text-muted-foreground">
              Organization audit events (scoped by this project’s org).
            </p>
          </div>

          <Link
            href={`/console/projects/${projectId}`}
            className="inline-block rounded border px-3 py-2 text-sm hover:bg-muted"
          >
            Back to Project
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Newest first</Badge>
          <Badge variant="outline">Cursor pagination</Badge>

          {sp.actorUserId ? (
            <Badge variant="outline">Actor: {sp.actorUserId}</Badge>
          ) : null}
          {sp.action ? (
            <Badge variant="outline">Action: {sp.action}</Badge>
          ) : null}
          {sp.targetType ? (
            <Badge variant="outline">TargetType: {sp.targetType}</Badge>
          ) : null}
          {sp.targetId ? (
            <Badge variant="outline">TargetId: {sp.targetId}</Badge>
          ) : null}
          {sp.q ? <Badge variant="outline">Search: {sp.q}</Badge> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit events</CardTitle>
          <CardDescription>
            Showing {data.items.length} row(s). Filter by
            actor/action/target/search.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Datalists */}
          <datalist id="audit-actions">
            {actionOptions.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <datalist id="audit-target-types">
            {targetTypeOptions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <form className="grid gap-3 rounded-xl border p-4 md:grid-cols-6">
            <div className="grid gap-1 md:col-span-2">
              <Label className="text-xs">Search</Label>
              <Input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="action / targetType / targetId..."
                className="h-9"
              />
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">Actor</Label>
              <Select name="actorUserId" defaultValue={sp.actorUserId ?? ""}>
                <option value="">All</option>
                {memberUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email ?? u.id}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">Action (exact)</Label>
              <Input
                name="action"
                defaultValue={sp.action ?? ""}
                placeholder="api_key.created"
                list="audit-actions"
                className="h-9"
              />
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">Target type (exact)</Label>
              <Input
                name="targetType"
                defaultValue={sp.targetType ?? ""}
                placeholder="ApiKey / FeatureFlag"
                list="audit-target-types"
                className="h-9"
              />
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">Take</Label>
              <Input
                name="take"
                defaultValue={sp.take ?? "50"}
                placeholder="50"
                className="h-9"
              />
            </div>

            <div className="grid gap-1 md:col-span-2">
              <Label className="text-xs">Target id (exact)</Label>
              <Input
                name="targetId"
                defaultValue={sp.targetId ?? ""}
                placeholder="cuid..."
                className="h-9"
              />
            </div>

            <div className="flex items-end gap-2 md:col-span-6">
              <Button type="submit" size="sm">
                Apply
              </Button>

              <Button asChild type="button" variant="outline" size="sm">
                <Link href={`/console/projects/${projectId}/audit`}>Reset</Link>
              </Button>
            </div>
          </form>

          <div className="mt-4">
            <AuditTableClient items={data.items} />
          </div>

          <div className="mt-4 flex items-center gap-2">
            {data.nextCursor ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/console/projects/${projectId}/audit?${nextQs.toString()}`}
                >
                  Load more
                </Link>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                No more rows.
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
