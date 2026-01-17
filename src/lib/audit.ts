import type { PrismaClient } from "@prisma/client";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export type WriteAuditInput = {
  organizationId: string;
  actorUserId: string | null;

  // scope
  projectId?: string | null;
  environmentId?: string | null;

  // event
  action: string;
  kind?: string | null; // "api_key" | "environment" | "project" | ...
  targetType: string;
  targetId: string;

  // LD-style resources
  resources?: string[]; // allow override
  parentResource?: string | null;

  // payload
  metaJson?: unknown;
};

function buildResources(i: WriteAuditInput): {
  resources: string[];
  parentResource: string | null;
} {
  // If caller provided explicit resources, trust them.
  if (i.resources && i.resources.length > 0) {
    return { resources: i.resources, parentResource: i.parentResource ?? null };
  }

  const resources: string[] = [];
  let parentResource: string | null = null;

  if (i.projectId) {
    const proj = `proj/${i.projectId}`;
    resources.push(proj);
    parentResource = proj;
  }

  if (i.projectId && i.environmentId) {
    const env = `proj/${i.projectId}:env/${i.environmentId}`;
    resources.push(env);
    parentResource = env; // more specific parent
  }

  // target resource (best-effort)
  if (i.projectId && i.environmentId) {
    const leaf = `${i.targetType.toLowerCase()}/${i.targetId}`;
    resources.push(`proj/${i.projectId}:env/${i.environmentId}:${leaf}`);
  } else if (i.projectId) {
    const leaf = `${i.targetType.toLowerCase()}/${i.targetId}`;
    resources.push(`proj/${i.projectId}:${leaf}`);
  } else {
    resources.push(`${i.targetType.toLowerCase()}/${i.targetId}`);
  }

  return { resources, parentResource };
}

export async function writeAudit(tx: Tx, input: WriteAuditInput) {
  const { resources, parentResource } = buildResources(input);

  return tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      environmentId: input.environmentId ?? null,

      actorUserId: input.actorUserId ?? null,

      action: input.action,
      kind: input.kind ?? null,
      targetType: input.targetType,
      targetId: input.targetId,

      resources,
      parentResource,

      metaJson: input.metaJson ?? undefined,
    },
  });
}
