import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  return NextResponse.json({ projectId, usage: [] });
}
