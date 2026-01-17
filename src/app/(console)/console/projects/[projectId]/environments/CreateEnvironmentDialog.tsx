"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

type Env = {
  id: string;
  name: string;
  slug: string | null;
  createdAt: string;
};

export function CreateEnvironmentDialog({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (env: Env) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/environments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slug.trim() ? slug : undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.message ?? json?.error ?? "Failed to create environment.");
        return;
      }

      const env = json.environment as Env;
      onCreated(env);

      // reset + close
      setName("");
      setSlug("");
      setOpen(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">New environment</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create environment</DialogTitle>
          <DialogDescription>
            Create a new environment (e.g. dev, staging, prod). Slug should be stable.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production"
              className="h-9"
              required
              minLength={2}
              maxLength={80}
              disabled={loading}
            />
          </div>

          <div className="grid gap-1">
            <Label className="text-xs">Slug (optional for now)</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="prod"
              className="h-9"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Will be normalized (lowercase, spaces → dashes). Later you can make it required + unique.
            </p>
          </div>

          {error ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || name.trim().length < 2}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
