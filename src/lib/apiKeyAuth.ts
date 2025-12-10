import crypto from "crypto";
import { prisma } from "@/lib/db";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function extractSecret(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  const x = req.headers.get("x-api-key");
  return x?.trim() || null;
}

export async function requireApiKey(req: Request) {
  const secret = extractSecret(req);
  if (!secret) {
    return { ok: false as const, status: 401 as const, error: "missing_api_key" };
  }

  const hash = sha256(secret);

  const apiKey = await prisma.apiKey.findUnique({
    where: { hash },
    select: {
      id: true,
      projectId: true,
      environmentId: true,
      revokedAt: true,
    },
  });

  if (!apiKey) {
    return { ok: false as const, status: 401 as const, error: "invalid_api_key" };
  }

  if (apiKey.revokedAt) {
    return { ok: false as const, status: 403 as const, error: "revoked_api_key" };
  }

  if (!apiKey.environmentId) {
    return { ok: false as const, status: 400 as const, error: "key_missing_environment" };
  }

  // best-effort lastUsedAt
  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { ok: true as const, apiKey };
}
