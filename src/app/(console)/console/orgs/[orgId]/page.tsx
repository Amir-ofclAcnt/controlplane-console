"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";

type Project = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unexpected error";
}

export default function OrgDetailPage() {
  const router = useRouter();

  const params = useParams<{ orgId: string }>();
  const orgIdRaw = params?.orgId;
  const orgId = Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw;

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const canCreate = useMemo(
    () => name.trim().length >= 2 && !creating,
    [name, creating]
  );

  const load = useCallback(async () => {
    if (!orgId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orgs/${orgId}/projects`);
      if (!res.ok) {
        const j: unknown = await res.json().catch(() => null);
        const msg =
          typeof j === "object" &&
          j &&
          "error" in j &&
          typeof (j as { error?: unknown }).error === "string"
            ? (j as { error: string }).error
            : `Failed to load projects (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as { projects: Project[] };
      setProjects(data.projects ?? []);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const createProject = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!orgId || !canCreate) return;

      setCreating(true);
      setError(null);

      try {
        const res = await fetch(`/api/orgs/${orgId}/projects`, {
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
            typeof (j as { error?: unknown }).error === "string"
              ? (j as { error: string }).error
              : `Failed to create project (${res.status})`;
          throw new Error(msg);
        }

        const data = (await res.json()) as { project: Project };
        setName("");
        router.push(`/console/projects/${data.project.id}`);
        router.refresh();
      } catch (err: unknown) {
        setError(errorMessage(err));
      } finally {
        setCreating(false);
      }
    },
    [orgId, canCreate, name, router]
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (!orgId) {
    return (
      <div className="rounded-xl border p-4 text-sm text-muted-foreground">
        Missing organization id.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Organization</h1>
          <p className="text-sm text-muted-foreground">
            Org ID: <span className="font-mono">{orgId}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            className="rounded border px-3 py-2 text-sm hover:bg-muted"
            href="/console/orgs"
          >
            Back to Orgs
          </Link>
          <button
            onClick={() => void load()}
            className="rounded border px-3 py-2 text-sm hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <h2 className="font-medium">Create project</h2>
        <form
          onSubmit={createProject}
          className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input
            className="w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:ring-2"
            placeholder="e.g. web-app"
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
        <p className="mt-3 text-xs text-muted-foreground">
          New projects automatically get environments:{" "}
          <span className="font-mono">dev</span>,{" "}
          <span className="font-mono">staging</span>,{" "}
          <span className="font-mono">prod</span>.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Projects</h2>

        {loading ? (
          <div className="rounded-xl border p-4 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border p-4 text-sm text-muted-foreground">
            No projects yet. Create your first one above.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="divide-y">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/console/projects/${p.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.slug}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleString()}
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
