"use client";

type Bucket = {
  bucketStart: string;
  events: number;
  requests202: number;
  requests4xx: number;
  requests5xx: number;
  avgLatencyMs: number | null;
};

type Props = {
  buckets: Bucket[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toPoints(values: number[], w: number, h: number, pad = 10) {
  const max = Math.max(1, ...values);
  const min = 0;

  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  return values
    .map((v, i) => {
      const x = pad + (i * innerW) / Math.max(1, values.length - 1);
      const t = (v - min) / (max - min || 1);
      const y = pad + (1 - clamp(t, 0, 1)) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function UsageChart({ buckets }: Props) {
  const width = 900;
  const height = 220;

  const events = buckets.map((b) => b.events);
  const req = buckets.map((b) => b.requests202 + b.requests4xx + b.requests5xx);

  const eventsPoints = toPoints(events, width, height);
  const reqPoints = toPoints(req, width, height);

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Traffic (events vs requests)</div>
        <div className="text-xs text-muted-foreground">
          Events + Requests (/v1/events)
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg width={width} height={height} role="img" aria-label="Usage chart">
          {/* grid */}
          {Array.from({ length: 5 }).map((_, i) => {
            const y = 10 + (i * (height - 20)) / 4;
            return (
              <line
                key={i}
                x1="10"
                y1={y}
                x2={width - 10}
                y2={y}
                stroke="currentColor"
                opacity={0.08}
              />
            );
          })}

          {/* series: requests */}
          <polyline
            points={reqPoints}
            fill="none"
            stroke="currentColor"
            opacity={0.55}
            strokeWidth="2"
          />

          {/* series: events */}
          <polyline
            points={eventsPoints}
            fill="none"
            stroke="currentColor"
            opacity={0.95}
            strokeWidth="2"
          />
        </svg>
      </div>

      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-4 rounded bg-foreground/90" />
          Events
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-4 rounded bg-foreground/50" />
          Requests
        </div>
      </div>
    </div>
  );
}
