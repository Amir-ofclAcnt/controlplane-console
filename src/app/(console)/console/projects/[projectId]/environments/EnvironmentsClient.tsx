"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Env = {
  id: string;
  name: string;
  slug: string | null;
  createdAt: string;
};

type EnvironmentsResponse = { environments: Env[] };

type ApiErrorResponse = {
  error?: string;
  message?: string;
  details?: unknown;
};

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

async function fetchJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchEnvironments(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/environments`, {
    cache: "no-store",
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to load environments (${res.status})`);
  }

  const json = await fetchJson<EnvironmentsResponse>(res);
  return json?.environments ?? [];
}

export default function EnvironmentsClient({
  projectId,
  initialEnvironments = [],
}: {
  projectId: string;
  initialEnvironments?: Env[];
}) {
  const [items, setItems] = React.useState<Env[]>(initialEnvironments);
  const [loading, setLoading] = React.useState(
    initialEnvironments.length === 0
  );
  const [error, setError] = React.useState<string | null>(null);

  // Create dialog state
  const [open, setOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createSlug, setCreateSlug] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const slugPreview = React.useMemo(
    () => normalizeSlug(createSlug),
    [createSlug]
  );

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const envs = await fetchEnvironments(projectId);
      setItems(envs);
    } catch (e: unknown) {
      // Keep existing items; just show an error
      const message =
        e instanceof Error ? e.message : "Failed to load environments";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Only fetch on mount if we do NOT have initial data
  React.useEffect(() => {
    if (initialEnvironments.length > 0) return;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const envs = await fetchEnvironments(projectId);
        if (!cancelled) setItems(envs);
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : "Failed to load environments";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialEnvironments.length]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);

    const name = createName.trim();
    const slug = normalizeSlug(createSlug);

    if (name.length < 2) {
      setCreateError("Name must be at least 2 characters.");
      return;
    }
    if (!slug) {
      setCreateError("Slug is required.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/environments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, slug }),
      });

      const errJson = await fetchJson<ApiErrorResponse>(res);

      if (!res.ok) {
        if (res.status === 409) {
          setCreateError(
            errJson?.message ??
              "That slug already exists. Pick a different slug."
          );
          return;
        }

        setCreateError(
          errJson?.message ??
            errJson?.error ??
            `Failed to create environment (${res.status})`
        );
        return;
      }

      const okJson = await fetchJson<{ environment?: Env }>(res);
      const created = okJson?.environment ?? null;

      if (created) {
        // Update list immediately (fast UX)
        setItems((prev) => {
          const merged = [created, ...prev.filter((x) => x.id !== created.id)];
          merged.sort((a, b) => {
            const as = (a.slug ?? "").localeCompare(b.slug ?? "");
            if (as !== 0) return as;
            const bn = a.name.localeCompare(b.name);
            if (bn !== 0) return bn;
            return a.id.localeCompare(b.id);
          });
          return merged;
        });
      }

      // Close + reset
      setOpen(false);
      setCreateName("");
      setCreateSlug("");
      setCreateError(null);

      // Re-fetch to stay consistent with server truth
      await reload();
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header row with Create button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {items.length} environment(s)
        </div>

        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setCreateError(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">New environment</Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create environment</DialogTitle>
              <DialogDescription>
                Use a stable slug (dev / staging / prod). Names can change;
                slugs should not.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={onCreate} className="grid gap-4">
              <div className="grid gap-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Production"
                  className="h-9"
                  disabled={creating}
                  required
                />
              </div>

              <div className="grid gap-1">
                <Label className="text-xs">Slug</Label>
                <Input
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                  placeholder="prod"
                  className="h-9"
                  disabled={creating}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Normalized:{" "}
                  <span className="font-mono">{slugPreview || "—"}</span>
                </p>
              </div>

              {createError ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  {createError}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating || slugPreview.length < 1}
                >
                  {creating ? "Creating..." : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Loading / error */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : null}

      {error ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-red-600">{error}</div>
            <Button size="sm" variant="outline" onClick={reload}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      {/* Empty state */}
      {!loading && items.length === 0 ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          No environments yet. Create <span className="font-mono">dev</span>,{" "}
          <span className="font-mono">staging</span>, and{" "}
          <span className="font-mono">prod</span>.
        </div>
      ) : null}

      {/* List */}
      {!loading && items.length > 0 ? (
        <div className="rounded-lg border">
          <div className="grid grid-cols-12 gap-2 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <div className="col-span-5">Name</div>
            <div className="col-span-4">Slug</div>
            <div className="col-span-3 text-right">Created</div>
          </div>

          {items.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-muted/30"
            >
              <div className="col-span-5 font-medium">{e.name}</div>
              <div className="col-span-4 font-mono text-xs">
                {e.slug ?? "—"}
              </div>
              <div className="col-span-3 text-right text-xs text-muted-foreground">
                {formatWhen(e.createdAt)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
