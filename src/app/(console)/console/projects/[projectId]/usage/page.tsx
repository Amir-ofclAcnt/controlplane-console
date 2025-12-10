import Link from "next/link";

export const runtime = "nodejs";

export default async function ProjectUsagePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="text-sm text-muted-foreground">
          Project ID: <span className="font-mono">{projectId}</span>
        </p>
      </div>

      <Link
        href={`/console/projects/${projectId}`}
        className="inline-block rounded border px-3 py-2 text-sm hover:bg-muted"
      >
        Back to Project
      </Link>

      <div className="rounded-xl border p-4 text-sm text-muted-foreground">
        Usage UI coming next.
      </div>
    </div>
  );
}
