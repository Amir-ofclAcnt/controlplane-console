import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/apiKeyAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weak/strong ETag compare:
// - If-None-Match can be: W/"abc", "abc", or a list: "a", W/"b", "*"
function ifNoneMatchHas(inm: string | null, etag: string) {
  if (!inm) return false;

  const v = inm.trim();
  if (v === "*") return true;

  // Split on commas for multiple etags
  const parts = v.split(",").map((s) => s.trim()).filter(Boolean);

  // Compare:
  // - exact strong match: `"hash"` === `"hash"`
  // - weak match: `W/"hash"` should match `"hash"` for our purposes
  for (const p of parts) {
    if (p === etag) return true;
    if (p.startsWith("W/") && p.slice(2).trim() === etag) return true;
  }
  return false;
}

function toHttpDate(d: Date) {
  return d.toUTCString();
}

// GET /v1/config (API key auth)
export async function GET(req: Request) {
  const auth = await requireApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { apiKey } = auth;

  // Latest published snapshot for this environment
  const snapshot = await prisma.configSnapshot.findFirst({
    where: {
      environmentId: apiKey.environmentId!,
      status: "PUBLISHED",
    },
    orderBy: { version: "desc" },
    select: {
      version: true,
      contentSha256: true,
      contentJson: true,
      publishedAt: true,
      createdAt: true,
    },
  });

  if (!snapshot) {
    return NextResponse.json(
      { error: "no_published_config" },
      {
        status: 404,
        headers: {
          // Don’t cache misses, especially during rollout / first publish
          "Cache-Control": "no-store",
          Vary: "Authorization, X-API-Key",
        },
      }
    );
  }

  const etag = `"${snapshot.contentSha256}"`;
  const lastModifiedDate = snapshot.publishedAt ?? snapshot.createdAt;
  const lastModified = toHttpDate(lastModifiedDate);

  const baseHeaders: Record<string, string> = {
    ETag: etag,
    "Last-Modified": lastModified,
    // Prevent shared caches from mixing responses across API keys
    Vary: "Authorization, X-API-Key",
    // Safe default: allow client revalidation; bandwidth saved via 304
    "Cache-Control": "private, max-age=0, must-revalidate",
  };

  // Validator precedence: If-None-Match > If-Modified-Since
  const inm = req.headers.get("if-none-match");
  if (ifNoneMatchHas(inm, etag)) {
    return new NextResponse(null, { status: 304, headers: baseHeaders });
  }

  const ims = req.headers.get("if-modified-since");
  if (ims) {
    const imsTime = Date.parse(ims);
    if (!Number.isNaN(imsTime)) {
      const lmTime = lastModifiedDate.getTime();
      // If resource not modified since IMS, return 304
      if (lmTime <= imsTime) {
        return new NextResponse(null, { status: 304, headers: baseHeaders });
      }
    }
  }

  return NextResponse.json(
    {
      version: snapshot.version,
      sha256: snapshot.contentSha256,
      publishedAt: snapshot.publishedAt,
      createdAt: snapshot.createdAt,
      config: snapshot.contentJson,
    },
    { status: 200, headers: baseHeaders }
  );
}
