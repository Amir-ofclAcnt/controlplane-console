import Link from "next/link";

export const runtime = "nodejs";

export default async function OrgMembersPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-sm text-muted-foreground">
          Org ID: <span className="font-mono">{orgId}</span>
        </p>
      </div>

      <Link
        href={`/console/orgs/${orgId}`}
        className="rounded border px-3 py-2 text-sm hover:bg-muted inline-block"
      >
        Back to Org
      </Link>

      <div className="rounded-xl border p-4 text-sm text-muted-foreground">
        Members UI coming next.
      </div>
    </div>
  );
}
