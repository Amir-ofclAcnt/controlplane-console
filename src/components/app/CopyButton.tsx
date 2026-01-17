"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  size = "sm",
  variant = "outline",
  className,
  disabled,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "destructive"
    | "ghost"
    | "link";
  className?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  async function onCopy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled ?? !value}
      onClick={onCopy}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}
