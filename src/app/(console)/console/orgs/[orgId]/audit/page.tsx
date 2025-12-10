import Link from "next/link";

export default async function OrgAuditPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit</h1>
        <p className="text-sm text-muted-foreground">
          Organization: <span className="font-mono">{orgId}</span>
        </p>
      </div>

      <div className="flex gap-2">
        <Link
          href={`/console/orgs/${orgId}`}
          className="rounded border px-3 py-2 text-sm hover:bg-muted"
        >
          Back to Org
        </Link>
      </div>

      <div className="rounded-xl border p-4 text-sm text-muted-foreground">
        Audit UI coming next. This page exists to keep the route valid during build.
      </div>
    </div>
  );
}
