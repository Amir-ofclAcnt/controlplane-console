"use server";

import crypto from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

const CreateSchema = z.object({
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  name: z.string().min(1).max(80),
});

export type CreateApiKeyState =
  | { ok: false; error: string; secret?: never }
  | { ok: true; secret: string };

async function requireProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: { members: { some: { userId } } },
    },
    select: { id: true },
  });

  if (!project) throw new Error("not_found_or_forbidden");
}

async function requireEnvironmentInProject(environmentId: string, projectId: string) {
  const env = await prisma.environment.findFirst({
    where: { id: environmentId, projectId },
    select: { id: true },
  });
  if (!env) throw new Error("invalid_environment");
}

export async function createApiKeyAction(
  _prev: CreateApiKeyState,
  formData: FormData
): Promise<CreateApiKeyState> {
  const session = await auth();
  const userId = session?.userId;
  if (!userId) return { ok: false, error: "unauthorized" };

  const parsed = CreateSchema.safeParse({
    projectId: formData.get("projectId"),
    environmentId: formData.get("environmentId"),
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_request" };
  }

  const { projectId, environmentId, name } = parsed.data;

  try {
    await requireProjectAccess(projectId, userId);
    await requireEnvironmentInProject(environmentId, projectId);

    // Generate secret once. Store only hash + prefix.
    const prefix = `cpk_${crypto.randomBytes(4).toString("hex")}`;
    const secret = `${prefix}_${crypto.randomBytes(24).toString("hex")}`;
    const hash = sha256(secret);

    await prisma.apiKey.create({
      data: {
        projectId,
        environmentId,
        name,
        prefix,
        hash,
        createdByUserId: userId,
      },
      select: { id: true },
    });

    revalidatePath(`/console/projects/${projectId}/keys`);
    return { ok: true, secret };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    return { ok: false, error: msg };
  }
}

const RevokeSchema = z.object({
  projectId: z.string().min(1),
  apiKeyId: z.string().min(1),
});

export async function revokeApiKeyAction(formData: FormData) {
  const session = await auth();
  const userId = session?.userId;
  if (!userId) throw new Error("unauthorized");

  const parsed = RevokeSchema.safeParse({
    projectId: formData.get("projectId"),
    apiKeyId: formData.get("apiKeyId"),
  });
  if (!parsed.success) throw new Error("invalid_request");

  const { projectId, apiKeyId } = parsed.data;

  await requireProjectAccess(projectId, userId);

  // Ensure the key belongs to this project
  const key = await prisma.apiKey.findFirst({
    where: { id: apiKeyId, projectId },
    select: { id: true, revokedAt: true },
  });
  if (!key) throw new Error("not_found");

  if (!key.revokedAt) {
    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });
  }

  revalidatePath(`/console/projects/${projectId}/keys`);
}
