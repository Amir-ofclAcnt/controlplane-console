"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Org = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unexpected error";
}

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const canCreate = useMemo(
    () => name.trim().length >= 2 && !creating,
    [name, creating]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orgs", { cache: "no-store" });
      if (!res.ok) {
        const j: unknown = await res.json().catch(() => null);
        const msg =
          typeof j === "object" &&
          j &&
          "error" in j &&
          typeof (j as { error: unknown }).error === "string"
            ? (j as { error: string }).error
            : `Failed to load orgs (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as { orgs: Org[] };
      setOrgs(data.orgs ?? []);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const createOrg = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canCreate) return;

      setCreating(true);
      setError(null);
      try {
        const res = await fetch("/api/orgs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });

        if (!res.ok) {
          const j: unknown = await res.json().catch(() => null);
          const msg =
            typeof j === "object" &&
            j &&
            "error" in j &&
            typeof (j as { error: unknown }).error === "string"
              ? (j as { error: string }).error
              : `Failed to create org (${res.status})`;
          throw new Error(msg);
        }

        setName("");
        await load();
      } catch (err: unknown) {
        setError(errorMessage(err));
      } finally {
        setCreating(false);
      }
    },
    [canCreate, load, name]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Organizations</h1>
          <p className="text-sm text-muted-foreground">
            Create an organization first, then create projects inside it.
          </p>
        </div>

        <button
          onClick={() => void load()}
          className="rounded border px-3 py-2 text-sm hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-xl border p-4">
        <h2 className="font-medium">Create organization</h2>
        <form
          onSubmit={createOrg}
          className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input
            className="w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:ring-2"
            placeholder="e.g. Acme Inc"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            disabled={!canCreate}
            className="rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Your organizations</h2>

        {loading ? (
          <div className="rounded-xl border p-4 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : orgs.length === 0 ? (
          <div className="rounded-xl border p-4 text-sm text-muted-foreground">
            No organizations yet. Create your first one above.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="divide-y">
              {orgs.map((o) => (
                <Link
                  key={o.id}
                  href={`/console/orgs/${o.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted"
                >
                  <div>
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.slug}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleString()}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
