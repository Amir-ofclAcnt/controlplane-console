"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
import CopyCode from "@/components/app/CopyCode";

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

export default function AuditTableClient({ items }: { items: AuditItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const selectedId = sp.get("audit");

  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<AuditItem | null>(null);

  // Open dialog if URL contains ?audit=<id>
  React.useEffect(() => {
    if (!selectedId) return;
    const found = items.find((x) => x.id === selectedId) ?? null;
    setSelected(found);
    setOpen(Boolean(found));
  }, [selectedId, items]);

  const metaPretty = React.useMemo(
    () => (selected ? prettyJson(selected.metaJson) : ""),
    [selected]
  );

  function setAuditParam(id: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (id) next.set("audit", id);
    else next.delete("audit");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function onRowClick(item: AuditItem) {
    setSelected(item);
    setOpen(true);
    setAuditParam(item.id);
  }

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[170px]">When</TableHead>
            <TableHead className="w-[220px]">Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="w-[160px]">Target</TableHead>
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
                  onClick={() => onRowClick(it)}
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
                        onRowClick(it);
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

      {/* One dialog instance, driven by selected item */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setAuditParam(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Audit entry</DialogTitle>
          </DialogHeader>

          {!selected ? (
            <div className="text-sm text-muted-foreground">
              No entry selected.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
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
                    <CopyCode value={`${pathname}?audit=${selected.id}`} />
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">metaJson</div>
                  {metaPretty ? (
                    <div className="w-[360px] max-w-full">
                      <CopyCode value={metaPretty} />
                    </div>
                  ) : null}
                </div>

                {metaPretty ? (
                  <pre className="max-h-[360px] overflow-auto rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
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
