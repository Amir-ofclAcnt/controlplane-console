"use client";

import * as React from "react";
import { useActionState } from "react";
import type { CreateApiKeyState } from "./actions";
import { createApiKeyAction } from "./actions";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Env = { id: string; name: string; slug: string | null };

const initialState: CreateApiKeyState = { ok: false, error: "" };

export function KeyGenerator({
  projectId,
  environments,
}: {
  projectId: string;
  environments: Env[];
}) {
  const [state, action, pending] = useActionState(
    createApiKeyAction,
    initialState
  );
  const [envId, setEnvId] = React.useState<string>(environments[0]?.id ?? "");

  const secret = state.ok ? state.secret : null;

  async function copy() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate API key</CardTitle>
        <CardDescription>
          The secret is shown only once. Store it securely.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form action={action} className="space-y-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="environmentId" value={envId} />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                name="name"
                placeholder="e.g. Local dev key"
                required
                maxLength={80}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Environment</label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={envId}
                onChange={(e) => setEnvId(e.target.value)}
              >
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.slug ? ` (${e.slug})` : ""}
                  </option>
                ))}
              </select>

              {!envId ? (
                <p className="text-xs text-destructive">
                  Create an environment first.
                </p>
              ) : null}
            </div>
          </div>

          <Button type="submit" disabled={pending || !envId}>
            {pending ? "Generating..." : "Generate key"}
          </Button>

          {!state.ok && state.error ? (
            <p className="text-sm text-destructive">Error: {state.error}</p>
          ) : null}
        </form>

        {secret ? (
          <div className="rounded-xl border p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">
                Your new API key (shown once)
              </div>
              <Badge variant="outline">Copy it now</Badge>
            </div>

            <pre className="overflow-auto rounded-lg bg-muted p-3 text-xs">
              {secret}
            </pre>

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                Copy
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              This value cannot be retrieved later (only the hash is stored).
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
