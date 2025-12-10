import Link from "next/link";

export default function ConsoleHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Console</h1>
        <p className="text-sm text-muted-foreground">
          Welcome. Start by creating or selecting an organization.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/console/orgs"
          className="rounded border px-3 py-2 text-sm hover:bg-muted"
        >
          Organizations
        </Link>

        <Link
          href="/console/settings"
          className="rounded border px-3 py-2 text-sm hover:bg-muted"
        >
          Settings
        </Link>
      </div>

      <div className="rounded-xl border p-4 text-sm text-muted-foreground">
        Tip: Create an org → create a project → generate an API key.
      </div>
    </div>
  );
}
