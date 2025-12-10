import crypto from "crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

function sha256String(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function buildEnvironmentSnapshot(environmentId: string) {
  const env = await prisma.environment.findUnique({
    where: { id: environmentId },
    select: {
      id: true,
      slug: true,
      name: true,
      project: {
        select: {
          id: true,
          slug: true,
          name: true,
          organizationId: true,
        },
      },
    },
  });

  if (!env) return null;

  // MVP snapshot structure (we will add flags/segments soon)
  const content = {
    schemaVersion: 1,
    publishedAt: new Date().toISOString(),
    organizationId: env.project.organizationId,
    project: { id: env.project.id, slug: env.project.slug, name: env.project.name },
    environment: { id: env.id, slug: env.slug, name: env.name },
    flags: [],
    segments: [],
  };

  const json = JSON.stringify(content);
  const contentSha256 = sha256String(json);

  return {
    contentJson: content as unknown as Prisma.InputJsonValue,
    contentSha256,
  };
}
