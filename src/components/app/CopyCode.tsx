"use client";

import * as React from "react";
import { CopyButton } from "@/components/app/CopyButton";

export default function CopyCode({ value }: { value: string }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2 rounded-lg border bg-muted/40 p-3">
      <code className="min-w-0 flex-1 truncate font-mono text-xs" title={value}>
        {value}
      </code>

      <CopyButton value={value} className="shrink-0" />
    </div>
  );
}
