import Link from "next/link";

export const runtime = "nodejs";

export default async function ProjectKeysPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Project ID: <span className="font-mono">{projectId}</span>
        </p>
      </div>

      <Link
        href={`/console/projects/${projectId}`}
        className="rounded border px-3 py-2 text-sm hover:bg-muted inline-block"
      >
        Back to Project
      </Link>

      <div className="rounded-xl border p-4 text-sm text-muted-foreground">
        Keys UI coming next.
      </div>
    </div>
  );
}
