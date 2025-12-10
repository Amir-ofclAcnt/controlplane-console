"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Environment = {
  id: string;
  name: string;
  slug: string | null;
};

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  environmentId: string | null;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
};

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unexpected error";
}

export default function ProjectClient({ projectId }: { projectId: string }) {
  const router = useRouter();

  const [envs, setEnvs] = useState<Environment[]>([]);
  const [envLoading, setEnvLoading] = useState(true);
  const [envError, setEnvError] = useState<string | null>(null);

  const [selectedEnvId, setSelectedEnvId] = useState<string>("");

  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [createdHeader, setCreatedHeader] = useState<string | null>(null);

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);

  const canCreateKey = useMemo(() => {
    return keyName.trim().length >= 2 && !!selectedEnvId && !creatingKey;
  }, [keyName, selectedEnvId, creatingKey]);

  const loadEnvironments = useCallback(async () => {
    setEnvLoading(true);
    setEnvError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/environments`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const j: unknown = await res.json().catch(() => null);
        const msg =
          typeof j === "object" &&
          j &&
          "error" in j &&
          typeof (j as { error?: unknown }).error === "string"
            ? (j as { error: string }).error
            : `Failed to load environments (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as { environments: Environment[] };
      const list = data.environments ?? [];
      setEnvs(list);

      // default to dev if present, otherwise first
      const dev = list.find((e) => e.slug === "dev");
      const initial = dev?.id ?? list[0]?.id ?? "";
      setSelectedEnvId((prev) => prev || initial);
    } catch (err: unknown) {
      setEnvError(errorMessage(err));
    } finally {
      setEnvLoading(false);
    }
  }, [projectId]);

  const loadKeys = useCallback(async () => {
    if (!selectedEnvId) return;

    setKeysLoading(true);
    setKeysError(null);

    try {
      // If you haven't created GET keys yet, keep this disabled for now.
      // Once implemented, this will work:
      // GET /api/projects/:projectId/keys?envId=...
      const res = await fetch(
        `/api/projects/${projectId}/keys?envId=${encodeURIComponent(
          selectedEnvId
        )}`,
        { cache: "no-store" }
      );

      if (res.status === 404) {
        setKeys([]);
        return;
      }

      if (!res.ok) {
        const j: unknown = await res.json().catch(() => null);
        const msg =
          typeof j === "object" &&
          j &&
          "error" in j &&
          typeof (j as { error?: unknown }).error === "string"
            ? (j as { error: string }).error
            : `Failed to load keys (${res.status})`;
        throw new Error(msg);
      }

      const data = (await res.json()) as { apiKeys: ApiKeyRow[] };
      setKeys(data.apiKeys ?? []);
    } catch (err: unknown) {
      setKeysError(errorMessage(err));
    } finally {
      setKeysLoading(false);
    }
  }, [projectId, selectedEnvId]);

  const createKey = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canCreateKey) return;

      setCreatingKey(true);
      setCreateError(null);
      setCreatedSecret(null);
      setCreatedHeader(null);

      try {
        const res = await fetch(`/api/projects/${projectId}/keys`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: keyName.trim(),
            environmentId: selectedEnvId,
          }),
        });

        if (!res.ok) {
          const j: unknown = await res.json().catch(() => null);
          const msg =
            typeof j === "object" &&
            j &&
            "error" in j &&
            typeof (j as { error?: unknown }).error === "string"
              ? (j as { error: string }).error
              : `Failed to create key (${res.status})`;
          throw new Error(msg);
        }

        const data = (await res.json()) as {
          apiKey: ApiKeyRow;
          secret: string;
          authorizationHeader?: string;
        };

        setKeyName("");
        setCreatedSecret(data.secret);
        setCreatedHeader(data.authorizationHeader ?? null);

        // refresh keys list after creation
        void loadKeys();
        router.refresh();
      } catch (err: unknown) {
        setCreateError(errorMessage(err));
      } finally {
        setCreatingKey(false);
      }
    },
    [canCreateKey, keyName, selectedEnvId, projectId, loadKeys, router]
  );

  const revokeKey = useCallback(
    async (keyId: string) => {
      setKeysError(null);
      try {
        const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
        if (!res.ok) {
          const j: unknown = await res.json().catch(() => null);
          const msg =
            typeof j === "object" &&
            j &&
            "error" in j &&
            typeof (j as { error?: unknown }).error === "string"
              ? (j as { error: string }).error
              : `Failed to revoke key (${res.status})`;
          throw new Error(msg);
        }
        await loadKeys();
        router.refresh();
      } catch (err: unknown) {
        setKeysError(errorMessage(err));
      }
    },
    [loadKeys, router]
  );

  useEffect(() => {
    void loadEnvironments();
  }, [loadEnvironments]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Project</h1>
          <p className="text-sm text-muted-foreground">
            Project ID: <span className="font-mono">{projectId}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/console/orgs"
            className="rounded border px-3 py-2 text-sm hover:bg-muted"
          >
            Back to Orgs
          </Link>
          <button
            onClick={() => void loadEnvironments()}
            className="rounded border px-3 py-2 text-sm hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-medium">Environment</h2>

          {envLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : envs.length > 0 ? (
            <select
              className="rounded border bg-background px-3 py-2 text-sm"
              value={selectedEnvId}
              onChange={(e) => setSelectedEnvId(e.target.value)}
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

        {envs.length === 0 && !envLoading ? (
          <div className="text-sm text-muted-foreground">
            No environments found for this project.
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium">Create API key</h2>

        <form
          onSubmit={createKey}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input
            className="w-full rounded border bg-background px-3 py-2 text-sm outline-none focus:ring-2"
            placeholder="e.g. server-key"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
          />
          <button
            type="submit"
            disabled={!canCreateKey}
            className="rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
          >
            {creatingKey ? "Creating..." : "Create"}
          </button>
        </form>

        {createError ? (
          <div className="text-sm text-red-600">{createError}</div>
        ) : null}

        {createdSecret ? (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-sm font-medium">
              Secret (shown once — copy now)
            </div>
            <div className="font-mono text-sm break-all">{createdSecret}</div>
            {createdHeader ? (
              <>
                <div className="text-sm font-medium">Authorization header</div>
                <div className="font-mono text-sm break-all">
                  {createdHeader}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="text-xs text-muted-foreground">
          Keys are environment-scoped. The secret is never stored in plaintext
          and is only shown once.
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">API keys</h2>
          <button
            onClick={() => void loadKeys()}
            className="rounded border px-3 py-2 text-sm hover:bg-muted"
            disabled={!selectedEnvId || keysLoading}
          >
            {keysLoading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {keysError ? (
          <div className="text-sm text-red-600">{keysError}</div>
        ) : null}

        {!keysLoading && keys.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No keys for this environment yet.
          </div>
        ) : null}

        {keys.length > 0 ? (
          <div className="overflow-hidden rounded-lg border">
            <div className="divide-y">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{k.name}</div>
                      {k.revokedAt ? (
                        <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                          Revoked
                        </span>
                      ) : (
                        <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {k.prefix}
                    </div>
                    {k.lastUsedAt ? (
                      <div className="text-xs text-muted-foreground">
                        Last used: {new Date(k.lastUsedAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground">
                      {new Date(k.createdAt).toLocaleString()}
                    </div>

                    {!k.revokedAt ? (
                      <button
                        onClick={() => void revokeKey(k.id)}
                        className="rounded border px-3 py-2 text-sm hover:bg-muted"
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="text-xs text-muted-foreground">
          <span className="font-mono">GET /api/projects/[projectId]/keys</span>.
          Create works with the POST route.
        </div>
      </div>
    </div>
  );
}
