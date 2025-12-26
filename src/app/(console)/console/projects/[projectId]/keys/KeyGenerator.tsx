"use client";

import * as React from "react";

import { createApiKeyAction, revokeApiKeyAction, rotateApiKeyAction } from "./actions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import CopyCode from "@/components/app/CopyCode";

type Env = { id: string; name: string };

type KeyRow = {
  id: string;
  name: string | null;
  prefix: string;
  createdAt: Date;
  revokedAt: Date | null;
  environment: { id: string; name: string } | null;
};

export default function KeyGenerator(props: {
  projectId: string;
  environments: Env[];
  keys: KeyRow[];
}) {
  const { projectId, environments, keys } = props;

  const [name, setName] = React.useState("");
  const [envId, setEnvId] = React.useState(environments[0]?.id ?? "");
  const [pending, startTransition] = React.useTransition();

  const [secretOpen, setSecretOpen] = React.useState(false);
  const [secretValue, setSecretValue] = React.useState<string | null>(null);
  const [secretPrefix, setSecretPrefix] = React.useState<string | null>(null);

  function openSecretModal(fullKey: string, prefix: string) {
    setSecretValue(fullKey);
    setSecretPrefix(prefix);
    setSecretOpen(true);
  }

  async function onCreate() {
    if (!envId) return;

    startTransition(async () => {
      const res = await createApiKeyAction({
        projectId,
        environmentId: envId,
        name,
      });

      setName("");
      openSecretModal(res.key, res.prefix);
    });
  }

  async function onRevoke(apiKeyId: string) {
    const ok = confirm("Revoke this API key? This cannot be undone.");
    if (!ok) return;

    startTransition(async () => {
      await revokeApiKeyAction({ projectId, apiKeyId });
    });
  }

  async function onRotate(apiKeyId: string) {
    const ok = confirm(
      "Rotate this API key? A new key will be created and the old one will be revoked."
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await rotateApiKeyAction({ projectId, apiKeyId });
      openSecretModal(res.key, res.prefix);
    });
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="key-name">Name (optional)</Label>
          <Input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Prod ingest key"
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="key-env">Environment</Label>
          <select
            id="key-env"
            value={envId}
            onChange={(e) => setEnvId(e.target.value)}
            disabled={pending}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <Button onClick={onCreate} disabled={pending || !envId}>
            {pending ? "Working…" : "Generate API key"}
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Environment</th>
              <th className="py-2 px-3">Prefix</th>
              <th className="py-2 px-3">Created</th>
              <th className="py-2 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td className="py-4 px-3 text-muted-foreground" colSpan={6}>
                  No keys yet.
                </td>
              </tr>
            ) : (
              keys.map((k) => {
                const active = !k.revokedAt;
                return (
                  <tr key={k.id} className="border-b last:border-0">
                    <td className="py-2 px-3">
                      <Badge variant={active ? "default" : "outline"}>
                        {active ? "ACTIVE" : "REVOKED"}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">{k.name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-2 px-3">
                      {k.environment?.name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">{k.prefix}</td>
                    <td className="py-2 px-3 font-mono text-xs">
                      {new Date(k.createdAt).toISOString()}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRotate(k.id)}
                          disabled={pending}
                        >
                          Rotate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRevoke(k.id)}
                          disabled={pending || !active}
                        >
                          Revoke
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Once-only secret modal */}
      <Dialog open={secretOpen} onOpenChange={setSecretOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              This is the only time you will see the full secret. Copy it now and store it safely.
              <br />
              Prefix: <span className="font-mono">{secretPrefix ?? "—"}</span>
            </DialogDescription>
          </DialogHeader>

          {secretValue ? (
            <div className="space-y-3">
              <CopyCode value={secretValue} />
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                If you lose this secret, you must rotate the key to generate a new one.
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No secret available.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
