import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/api/auth/signin");

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside className="w-64 border-r min-h-screen p-4">
          <Link href="/console" className="font-semibold">
            ControlPlane
          </Link>

          <nav className="mt-6 space-y-1">
            <Link
              className="block rounded px-3 py-2 hover:bg-muted"
              href="/console"
            >
              Overview
            </Link>
            <Link
              className="block rounded px-3 py-2 hover:bg-muted"
              href="/console/orgs"
            >
              Organizations
            </Link>
          </nav>

          <div className="mt-8">
            <form action="/api/auth/signout" method="post">
              <button className="w-full rounded border px-3 py-2 text-sm hover:bg-muted">
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
