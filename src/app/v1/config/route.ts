import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/apiKeyAuth";

export const runtime = "nodejs";

// GET /v1/config (API key auth)
export async function GET(req: Request) {
  const auth = await requireApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { apiKey } = auth;

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
    return NextResponse.json({ error: "no_published_config" }, { status: 404 });
  }

  const etag = `"${snapshot.contentSha256}"`;
  const inm = req.headers.get("if-none-match");

  if (inm === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return NextResponse.json(
    {
      version: snapshot.version,
      sha256: snapshot.contentSha256,
      publishedAt: snapshot.publishedAt,
      createdAt: snapshot.createdAt,
      config: snapshot.contentJson,
    },
    {
      status: 200,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    }
  );
}
