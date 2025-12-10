"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Environment = { id: string; name: string; slug: string | null };

type FlagRow = {
  id: string;
  key: string;
  name: string;
  kind: "BOOLEAN";
  lifecycle: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  state: null | {
    enabled: boolean;
    valueBool: boolean;
    updatedAt: string;
  };
};

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unexpected error";
}

function isOkJsonError(j: unknown): j is { error?: string; message?: string } {
  return typeof j === "object" && j !== null;
}

export default function FlagsClient({ projectId }: { projectId: string }) {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [envLoading, setEnvLoading] = useState(true);
  const [envError, setEnvError] = useState<string | null>(null);
  const [envId, setEnvId] = useState<string>("");

  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagsError, setFlagsError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [flagKey, setFlagKey] = useState("");
  const [flagName, setFlagName] = useState("");

  const [savingId, setSavingId] = useState<string | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishErr, setPublishErr] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<null | {
    version: number;
    sha256: string;
    publishedAt: string;
  }>(null);

  const canCreate = useMemo(() => {
    const keyOk = /^[a-z0-9][a-z0-9_.-]*$/i.test(flagKey.trim());
    return keyOk && flagName.trim().length >= 2 && !creating;
  }, [flagKey, flagName, creating]);

  const loadEnvs = useCallback(async () => {
    setEnvLoading(true);
    setEnvError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/environments`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j: unknown = await res.json().catch(() => null);
        const msg =
          isOkJsonError(j) && typeof j.error === "string"
            ? j.error
            : `Failed to load environments (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as { environments: Environment[] };
      const list = data.environments ?? [];
      setEnvs(list);

      const prod = list.find((e) => e.slug === "prod");
      const dev = list.find((e) => e.slug === "dev");
      const initial = prod?.id ?? dev?.id ?? list[0]?.id ?? "";
      setEnvId((prev) => prev || initial);
    } catch (err) {
      setEnvError(errorMessage(err));
    } finally {
      setEnvLoading(false);
    }
  }, [projectId]);

  const loadFlags = useCallback(async () => {
    if (!envId) return;
    setFlagsLoading(true);
    setFlagsError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/flags?envId=${encodeURIComponent(envId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const j: unknown = await res.json().catch(() => null);
        const msg =
          isOkJsonError(j) && typeof j.error === "string"
            ? j.error
            : `Failed to load flags (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as { flags: FlagRow[] };
      setFlags(data.flags ?? []);
    } catch (err) {
      setFlagsError(errorMessage(err));
    } finally {
      setFlagsLoading(false);
    }
  }, [projectId, envId]);

  const createFlag = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canCreate) return;

      setCreating(true);
      setCreateErr(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/flags`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: flagKey.trim(), name: flagName.trim() }),
        });

        if (!res.ok) {
          const j: unknown = await res.json().catch(() => null);
          const msg =
            isOkJsonError(j) && typeof j.error === "string"
              ? typeof j.message === "string"
                ? `${j.error}: ${j.message}`
                : j.error
              : `Failed to create flag (${res.status})`;
          throw new Error(msg);
        }

        setFlagKey("");
        setFlagName("");
        await loadFlags();
      } catch (err) {
        setCreateErr(errorMessage(err));
      } finally {
        setCreating(false);
      }
    },
    [canCreate, projectId, flagKey, flagName, loadFlags]
  );

  const patchState = useCallback(
    async (
      flagId: string,
      patch: { enabled?: boolean; valueBool?: boolean }
    ) => {
      if (!envId) return;
      setSavingId(flagId);
      setFlagsError(null);
      try {
        const res = await fetch(`/api/environments/${envId}/flags/${flagId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });

        if (!res.ok) {
          const j: unknown = await res.json().catch(() => null);
          const msg =
            isOkJsonError(j) && typeof j.error === "string"
              ? j.error
              : `Failed to update flag (${res.status})`;
          throw new Error(msg);
        }

        await loadFlags();
      } catch (err) {
        setFlagsError(errorMessage(err));
      } finally {
        setSavingId(null);
      }
    },
    [envId, loadFlags]
  );

  const publish = useCallback(async () => {
    if (!envId) return;
    setPublishing(true);
    setPublishErr(null);
    setPublishResult(null);

    try {
      const res = await fetch(`/api/environments/${envId}/publish`, {
        method: "POST",
      });
      const j: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          isOkJsonError(j) && typeof j.error === "string"
            ? typeof j.message === "string"
              ? `${j.error}: ${j.message}`
              : j.error
            : `Publish failed (${res.status})`;
        throw new Error(msg);
      }

      const data = j as {
        version: number;
        sha256: string;
        publishedAt: string;
      };
      setPublishResult({
        version: data.version,
        sha256: data.sha256,
        publishedAt: data.publishedAt,
      });
    } catch (err) {
      setPublishErr(errorMessage(err));
    } finally {
      setPublishing(false);
    }
  }, [envId]);

  useEffect(() => {
    void loadEnvs();
  }, [loadEnvs]);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-medium">Environment</h2>

          {envLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : envs.length > 0 ? (
            <select
              className="rounded border bg-background px-3 py-2 text-sm"
              value={envId}
              onChange={(e) => setEnvId(e.target.value)}
            >
              {envs.map((e) => (
                <option key={e.id} value={e.id}>
                  {(e.slug ?? e.name).toString()}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {envError ? (
          <div className="text-sm text-red-600">{envError}</div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadFlags()}
            className="rounded border px-3 py-2 text-sm hover:bg-muted"
            disabled={!envId || flagsLoading}
          >
            {flagsLoading ? "Loading…" : "Refresh flags"}
          </button>

          <button
            onClick={() => void publish()}
            className="rounded bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
            disabled={!envId || publishing}
          >
            {publishing ? "Publishing…" : "Publish snapshot"}
          </button>
        </div>

        {publishErr ? (
          <div className="text-sm text-red-600">{publishErr}</div>
        ) : null}
        {publishResult ? (
          <div className="rounded-lg border p-3 text-sm">
            <div className="font-medium">Published</div>
            <div className="text-muted-foreground">
              Version <span className="font-mono">{publishResult.version}</span>
              , sha{" "}
              <span className="font-mono break-all">
                {publishResult.sha256}
              </span>
            </div>
            <div className="text-muted-foreground">
              {new Date(publishResult.publishedAt).toLocaleString()}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium">Create flag</h2>

        <form onSubmit={createFlag} className="grid gap-3 sm:grid-cols-3">
          <input
            className="rounded border bg-background px-3 py-2 text-sm outline-none focus:ring-2"
            placeholder="key (e.g. checkout.new_ui)"
            value={flagKey}
            onChange={(e) => setFlagKey(e.target.value)}
          />
          <input
            className="rounded border bg-background px-3 py-2 text-sm outline-none focus:ring-2"
            placeholder="name (e.g. New Checkout UI)"
            value={flagName}
            onChange={(e) => setFlagName(e.target.value)}
          />
          <button
            type="submit"
            disabled={!canCreate}
            className="rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </form>

        {createErr ? (
          <div className="text-sm text-red-600">{createErr}</div>
        ) : null}

        <div className="text-xs text-muted-foreground">
          Key must match{" "}
          <span className="font-mono">^[a-z0-9][a-z0-9_.-]*$</span>. Flags are
          project-scoped and have per-environment state.
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Flags</h2>
          <div className="text-sm text-muted-foreground">
            {flagsLoading ? "Loading…" : `${flags.length} flags`}
          </div>
        </div>

        {flagsError ? (
          <div className="text-sm text-red-600">{flagsError}</div>
        ) : null}

        {!flagsLoading && flags.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No flags yet. Create one above.
          </div>
        ) : null}

        {flags.length > 0 ? (
          <div className="overflow-hidden rounded-lg border">
            <div className="divide-y">
              {flags.map((f) => {
                const st = f.state ?? {
                  enabled: false,
                  valueBool: false,
                  updatedAt: f.updatedAt,
                };
                const busy = savingId === f.id;

                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{f.name}</div>
                        <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                          {f.kind}
                        </span>
                        <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                          {f.lifecycle}
                        </span>
                        {busy ? (
                          <span className="text-xs text-muted-foreground">
                            Saving…
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {f.key}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Updated: {new Date(st.updatedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!st.enabled}
                          onChange={(e) =>
                            void patchState(f.id, { enabled: e.target.checked })
                          }
                          disabled={!envId || busy}
                        />
                        Enabled
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!st.valueBool}
                          onChange={(e) =>
                            void patchState(f.id, {
                              valueBool: e.target.checked,
                            })
                          }
                          disabled={!envId || busy || !st.enabled}
                        />
                        Value
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="text-xs text-muted-foreground">
          After changing flags, publish a new snapshot. Your data plane will
          pick it up via <span className="font-mono">/v1/config</span>.
        </div>
      </div>
    </div>
  );
}
