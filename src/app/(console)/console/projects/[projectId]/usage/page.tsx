import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { UsageChart } from "./UsageChart";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsageBucket = {
  bucketStart: string;
  events: number;
  requests202: number;
  requests4xx: number;
  requests5xx: number;
  avgLatencyMs: number | null;
};

type UsageResponse = {
  projectId: string;
  from: string;
  to: string;
  bucket: "hour";
  buckets: UsageBucket[];
};

function formatHour(iso: string) {
  const d = new Date(iso);
  // Simple, predictable display; adjust later to user's locale/timezone.
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ProjectUsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ range?: string }>;
}) {
  const { projectId } = await params;
  const sp = (await searchParams) ?? {};
  const range = sp.range ?? "24h"; // default

  const h = await headers();
  const host = h.get("host");
  if (!host) throw new Error("Missing Host header");

  const proto = h.get("x-forwarded-proto") ?? "http";
  const cookie = h.get("cookie") ?? "";

  const res = await fetch(
    `${proto}://${host}/api/projects/${projectId}/usage?range=${encodeURIComponent(
      range
    )}`,
    { headers: { cookie }, cache: "no-store" }
  );

  if (res.status === 404) notFound();
  if (!res.ok) {
    // Keep it simple for now
    throw new Error(`Failed to load usage: ${res.status}`);
  }

  const data = (await res.json()) as UsageResponse;

  const totals = data.buckets.reduce(
    (acc, b) => {
      acc.events += b.events;
      acc.r202 += b.requests202;
      acc.r4xx += b.requests4xx;
      acc.r5xx += b.requests5xx;

      if (typeof b.avgLatencyMs === "number") {
        // Weighted by number of successful requests (best proxy we have here)
        const weight = b.requests202 + b.requests4xx + b.requests5xx;
        acc.latencySum += b.avgLatencyMs * Math.max(1, weight);
        acc.latencyCount += Math.max(1, weight);
      }
      return acc;
    },
    { events: 0, r202: 0, r4xx: 0, r5xx: 0, latencySum: 0, latencyCount: 0 }
  );

  const totalReq = totals.r202 + totals.r4xx + totals.r5xx;
  const errorReq = totals.r4xx + totals.r5xx;
  const errorRate =
    totalReq > 0 ? Math.round((errorReq / totalReq) * 1000) / 10 : 0;
  const avgLatency =
    totals.latencyCount > 0
      ? Math.round(totals.latencySum / totals.latencyCount)
      : null;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
            <p className="text-sm text-muted-foreground">
              Project ID: <span className="font-mono">{projectId}</span>
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
          <Badge variant="outline">Range: last 24 hours</Badge>
          <Badge variant="outline">Bucket: hourly</Badge>
          <span>
            From{" "}
            <span className="font-mono">
              {new Date(data.from).toISOString()}
            </span>{" "}
            to{" "}
            <span className="font-mono">{new Date(data.to).toISOString()}</span>
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm font-medium">Events (24h)</CardTitle>
            <CardDescription>Total events ingested.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{totals.events}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm font-medium">
              Requests (24h)
            </CardTitle>
            <CardDescription>POST /v1/events calls logged.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{totalReq}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              202: {totals.r202} · 4xx: {totals.r4xx} · 5xx: {totals.r5xx}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm font-medium">Error rate</CardTitle>
            <CardDescription>4xx + 5xx over total requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{errorRate}%</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Errors: {errorReq} / {totalReq}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm font-medium">Avg latency</CardTitle>
            <CardDescription>From RequestLog.latencyMs.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {avgLatency === null ? "—" : `${avgLatency} ms`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hourly table */}
      <Card>
        <CardHeader>
          <CardTitle>Hourly buckets</CardTitle>
          <CardDescription>
            Last 24 completed hours (UTC bucket boundaries).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.buckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Hour</th>
                    <th className="py-2 pr-4">Events</th>
                    <th className="py-2 pr-4">202</th>
                    <th className="py-2 pr-4">4xx</th>
                    <th className="py-2 pr-4">5xx</th>
                    <th className="py-2 pr-4">Avg latency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.buckets.map((b) => (
                    <tr key={b.bucketStart} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">
                        {formatHour(b.bucketStart)}
                      </td>
                      <td className="py-2 pr-4">{b.events}</td>
                      <td className="py-2 pr-4">{b.requests202}</td>
                      <td className="py-2 pr-4">{b.requests4xx}</td>
                      <td className="py-2 pr-4">{b.requests5xx}</td>
                      <td className="py-2 pr-4">
                        {b.avgLatencyMs === null ? "—" : `${b.avgLatencyMs} ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
