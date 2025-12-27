import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Logo from "@/components/icons/Logo";

export const runtime = "nodejs";

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </Link>
  );
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 p-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <Logo className="h-5 w-5" />
              <span>ControlPlane Console</span>
              <Badge variant="secondary" className="ml-1">
                MVP
              </Badge>
            </Link>

            <nav className="hidden items-center gap-4 sm:flex">
              <NavLink href="/docs">Docs</NavLink>
              <NavLink href="/docs/quickstart">Quickstart</NavLink>
              <NavLink href="/changelog">Changelog</NavLink>
              <NavLink href="/pricing">Pricing</NavLink>
              <NavLink href="/status">Status</NavLink>
              <NavLink href="/console">Console</NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Link href="/console">Open Console</Link>
            </Button>

            <Button asChild size="sm">
              <Link href="/api/auth/signin">Sign in</Link>
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="border-t sm:hidden">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-2 p-3">
            <NavLink href="/docs">Docs</NavLink>
            <NavLink href="/docs/quickstart">Quickstart</NavLink>
            <NavLink href="/changelog">Changelog</NavLink>
            <NavLink href="/pricing">Pricing</NavLink>
            <NavLink href="/status">Status</NavLink>
            <NavLink href="/console">Console</NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
