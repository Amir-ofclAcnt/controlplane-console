"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export default function CopyCode({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
      <code className="flex-1 overflow-x-auto font-mono text-xs">{value}</code>
      <Button type="button" variant="outline" size="sm" onClick={onCopy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
