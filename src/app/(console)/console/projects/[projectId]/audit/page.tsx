import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { Prisma } from "@prisma/client";

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
    projectId: string | null;
    environmentId: string | null;
    actor: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
    } | null;
  }>;
  nextCursor: string | null;
};

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
  cursor: optionalTrim(),
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

function iso(d: Date) {
  return d.toISOString();
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
    audit?: string; // deep link param (used by client dialog); ignored server-side
  }>;
}) {
  const { projectId } = await params;
  const sp = (await searchParams) ?? {};

  // 1) Auth gate
  const session = await auth();
  const userId = session?.userId;
  if (!userId) notFound();

  // 2) AuthZ: project must be accessible
  const project = await prisma.project.findFirst({
    where: { id: projectId, organization: { members: { some: { userId } } } },
    select: { id: true, organizationId: true },
  });
  if (!project) notFound();

  // Optional debug (remove later)
  console.log("AUDIT PAGE projectId:", projectId);
  console.log("AUDIT PAGE orgId:", project.organizationId);

  // 3) Parse query params (server-side safety)
  const parsed = QuerySchema.safeParse({
    take: sp.take,
    cursor: sp.cursor,
    actorUserId: sp.actorUserId,
    action: sp.action,
    targetType: sp.targetType,
    targetId: sp.targetId,
    q: sp.q,
  });

  if (!parsed.success) {
    // In prod you might prefer to ignore invalid params.
    throw new Error(`Invalid query: ${JSON.stringify(parsed.error.flatten())}`);
  }

  const { take, cursor, actorUserId, action, targetType, targetId, q } =
    parsed.data;

  // 4) Members dropdown
  const orgMembers = await prisma.orgMember.findMany({
    where: { organizationId: project.organizationId },
    select: { userId: true },
    orderBy: { userId: "asc" },
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

  // 5) Datalist suggestions (IMPORTANT: project-scoped)
  const [distinctActionsRows, distinctTargetTypesRows] = await Promise.all([
    prisma.auditLog.findMany({
      where: { organizationId: project.organizationId, projectId: project.id },
      distinct: ["action"],
      select: { action: true },
      take: 200,
    }),
    prisma.auditLog.findMany({
      where: { organizationId: project.organizationId, projectId: project.id },
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

  // 6) Prisma filters (IMPORTANT: project-scoped list)
  const where: Prisma.AuditLogWhereInput = {
    organizationId: project.organizationId,
    projectId: project.id,
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

  // 7) Query (newest first) + cursor pagination
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
      projectId: true,
      environmentId: true,
      actor: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  const hasMore = rows.length > take;
  const list = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? list[list.length - 1]?.id ?? null : null;

  const data: AuditResponse = {
    projectId,
    organizationId: project.organizationId,
    items: list.map((r) => ({ ...r, createdAt: iso(r.createdAt) })),
    nextCursor,
  };

  // 8) Preserve filters for "Load more" (and preserve ?audit deep-link)
  const qs = new URLSearchParams();
  qs.set("take", sp.take?.trim() ? sp.take : "50");
  if (sp.cursor) qs.set("cursor", sp.cursor);
  if (sp.actorUserId) qs.set("actorUserId", sp.actorUserId);
  if (sp.action) qs.set("action", sp.action);
  if (sp.targetType) qs.set("targetType", sp.targetType);
  if (sp.targetId) qs.set("targetId", sp.targetId);
  if (sp.q) qs.set("q", sp.q);
  if (sp.audit) qs.set("audit", sp.audit);

  const nextQs = new URLSearchParams(qs);
  if (data.nextCursor) nextQs.set("cursor", data.nextCursor);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Audit</h1>
            <p className="text-sm text-muted-foreground">
              Project-scoped audit events (within your organization).
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
                placeholder="snapshot.publish"
                list="audit-actions"
                className="h-9"
              />
            </div>

            <div className="grid gap-1">
              <Label className="text-xs">Target type (exact)</Label>
              <Input
                name="targetType"
                defaultValue={sp.targetType ?? ""}
                placeholder="environment"
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
            <AuditTableClient projectId={projectId} items={data.items} />
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
