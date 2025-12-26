"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function makePrefix() {
  // short stable prefix used for lookup/logging
  return `cpk_${crypto.randomBytes(4).toString("hex")}`;
}

function makeSecret() {
  // long random part (never stored in plaintext)
  return crypto.randomBytes(24).toString("hex");
}

async function requireUserAndProjectAccess(projectId: string) {
  const session = await auth();
  const userId = session?.userId;
  if (!userId) throw new Error("unauthorized");

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: { members: { some: { userId } } },
    },
    select: { id: true },
  });

  if (!project) throw new Error("not_found");
  return { userId };
}

export async function createApiKeyAction(input: {
  projectId: string;
  environmentId: string;
  name?: string;
}) {
  const { projectId, environmentId, name } = input;

  await requireUserAndProjectAccess(projectId);

  const env = await prisma.environment.findFirst({
    where: { id: environmentId, projectId },
    select: { id: true },
  });
  if (!env) throw new Error("invalid_environment");

  const prefix = makePrefix();
  const secret = makeSecret();
  const fullKey = `${prefix}_${secret}`;
  const safeName = name?.trim() || "API Key";

  const created = await prisma.apiKey.create({
    data: {
      projectId,
      environmentId,
      name: safeName,
      prefix,
      hash: sha256(fullKey),
      revokedAt: null,
    },
    select: { id: true },
  });

  revalidatePath(`/console/projects/${projectId}/keys`);

  return {
    apiKeyId: created.id,
    prefix,
    key: fullKey, // show ONCE in UI
  };
}

export async function revokeApiKeyAction(input: {
  projectId: string;
  apiKeyId: string;
}) {
  const { projectId, apiKeyId } = input;

  await requireUserAndProjectAccess(projectId);

  await prisma.apiKey.updateMany({
    where: { id: apiKeyId, projectId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  revalidatePath(`/console/projects/${projectId}/keys`);
  return { ok: true };
}

export async function rotateApiKeyAction(input: {
  projectId: string;
  apiKeyId: string;
}) {
  const { projectId, apiKeyId } = input;

  await requireUserAndProjectAccess(projectId);

  const oldKey = await prisma.apiKey.findFirst({
    where: { id: apiKeyId, projectId },
    select: { id: true, environmentId: true, name: true, revokedAt: true },
  });
  if (!oldKey) throw new Error("not_found");

  const prefix = makePrefix();
  const secret = makeSecret();
  const fullKey = `${prefix}_${secret}`;

  // Create new key
  const created = await prisma.apiKey.create({
    data: {
      projectId,
      environmentId: oldKey.environmentId,
      name: oldKey.name,
      prefix,
      hash: sha256(fullKey),
      revokedAt: null,
    },
    select: { id: true },
  });

  // Revoke old key (even if already revoked, this is idempotent-ish)
  await prisma.apiKey.updateMany({
    where: { id: oldKey.id, projectId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  revalidatePath(`/console/projects/${projectId}/keys`);

  return {
    newApiKeyId: created.id,
    prefix,
    key: fullKey, // show ONCE in UI
  };
}
