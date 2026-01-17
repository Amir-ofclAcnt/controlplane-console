"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CopyButton } from "@/components/app/CopyButton";
import CopyCode from "@/components/app/CopyCode";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditActor = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type AuditItem = {
  id: string;
  createdAt: string; // ISO string from API
  action: string;
  targetType: string;
  targetId: string;
  metaJson?: unknown | null;
  actor?: AuditActor | null;
};

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
    second: "2-digit",
  }).format(d);
}

function prettyJson(value: unknown) {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditTableClient({
  projectId,
  items,
}: {
  projectId: string;
  items: AuditItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const selectedId = sp.get("audit");

  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<AuditItem | null>(null);

  // Single canonical helper for replacing the URL querystring
  const replaceSearchParams = React.useCallback(
    (
      next: URLSearchParams,
      opts: {
        scroll?: boolean;
      } = { scroll: false }
    ) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, opts);
    },
    [router, pathname]
  );

  // Set or clear the ?audit= param
  // Optionally drop cursor when opening a row (deep-link should not keep pagination cursor)
  const setAuditParam = React.useCallback(
    (
      id: string | null,
      opts?: {
        dropCursor?: boolean;
      }
    ) => {
      const next = new URLSearchParams(sp.toString());

      if (opts?.dropCursor) next.delete("cursor");

      if (id) next.set("audit", id);
      else next.delete("audit");

      replaceSearchParams(next);
    },
    [sp, replaceSearchParams]
  );

  const onOpenItem = React.useCallback(
    (item: AuditItem) => {
      setSelected(item);
      setOpen(true);
      setAuditParam(item.id, { dropCursor: true });
    },
    [setAuditParam]
  );

  // When URL changes: open dialog if ?audit=<id>.
  // If not in current page items, fetch it (deep-link robustness).
  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!selectedId) {
        setSelected(null);
        setOpen(false);
        return;
      }

      // 1) Try local list first
      const found = items.find((x) => x.id === selectedId) ?? null;
      if (found) {
        setSelected(found);
        setOpen(true);
        return;
      }

      // 2) Not in current page -> fetch single item
      try {
        const res = await fetch(
          `/api/projects/${projectId}/audit/${encodeURIComponent(selectedId)}`,
          { cache: "no-store", credentials: "include" }
        );

        if (cancelled) return;

        if (res.status === 404) {
          // invalid link or not accessible: close & remove param
          setSelected(null);
          setOpen(false);
          setAuditParam(null);
          return;
        }

        if (!res.ok) {
          // keep URL, but don't crash UI
          setSelected(null);
          setOpen(false);
          return;
        }

        const json = (await res.json()) as { item: AuditItem };
        setSelected(json.item);
        setOpen(true);
      } catch {
        if (cancelled) return;
        setSelected(null);
        setOpen(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedId, items, projectId, setAuditParam]);

  const metaPretty = React.useMemo(
    () => (selected ? prettyJson(selected.metaJson) : ""),
    [selected]
  );

  const permalink = React.useMemo(() => {
    if (!selected) return "";
    if (typeof window === "undefined") return "";

    const url = new URL(window.location.href);
    url.searchParams.delete("cursor");
    url.searchParams.set("audit", selected.id);
    return url.toString();
  }, [selected]);

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[170px]">When</TableHead>
            <TableHead className="w-[220px]">Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="w-40">Target</TableHead>
            <TableHead className="w-[120px] text-right">Details</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                No audit entries found for the current filters.
              </TableCell>
            </TableRow>
          ) : (
            items.map((it) => {
              const actorName = it.actor?.name || it.actor?.email || "—";

              return (
                <TableRow
                  key={it.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => onOpenItem(it)}
                >
                  <TableCell className="text-sm text-muted-foreground">
                    {formatWhen(it.createdAt)}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      {it.actor?.image ? (
                        <Image
                          src={it.actor.image}
                          alt={actorName}
                          width={20}
                          height={20}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-muted" />
                      )}

                      <div className="min-w-0">
                        <div className="truncate text-sm">{actorName}</div>
                        {it.actor?.email && it.actor?.name ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {it.actor.email}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="font-medium">{it.action}</TableCell>

                  <TableCell className="text-sm">
                    <div className="truncate">
                      <span className="text-muted-foreground">
                        {it.targetType}:{" "}
                      </span>
                      <span className="font-mono">{it.targetId}</span>
                    </div>
                  </TableCell>

                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenItem(it);
                      }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setSelected(null);
            setAuditParam(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Audit entry</DialogTitle>
          </DialogHeader>

          {!selected ? (
            <div className="text-sm text-muted-foreground">
              No entry selected.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 sm:*:min-w-0">
                <div>
                  <div className="text-xs text-muted-foreground">Audit ID</div>
                  <div className="mt-1">
                    <CopyCode value={selected.id} />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">When</div>
                  <div className="mt-2 text-sm">
                    {formatWhen(selected.createdAt)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Actor</div>
                  <div className="mt-2 text-sm">
                    {selected.actor?.name || "—"}
                    {selected.actor?.email ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {selected.actor.email}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Action</div>
                  <div className="mt-2 text-sm font-medium">
                    {selected.action}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Target</div>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Type: </span>
                      {selected.targetType}
                    </div>

                    <div>
                      <div className="text-xs text-muted-foreground">
                        Target ID
                      </div>
                      <div className="mt-1">
                        <CopyCode value={selected.targetId} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Permalink</div>
                  <div className="mt-1">
                    <CopyCode value={permalink} />
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">metaJson</div>
                  {metaPretty ? (
                    <CopyButton
                      value={metaPretty}
                      label="Copy JSON"
                      className="shrink-0"
                    />
                  ) : null}
                </div>

                {metaPretty ? (
                  <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
                    {metaPretty}
                  </pre>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No metaJson on this entry.
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
