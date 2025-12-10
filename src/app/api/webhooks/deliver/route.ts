import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return NextResponse.json({ ok: true, received: body }, { status: 200 });
}
