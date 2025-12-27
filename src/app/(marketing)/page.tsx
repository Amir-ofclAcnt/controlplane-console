import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MarketingHomePage() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div className="space-y-5">
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm text-muted-foreground">
            MVP in active development · LaunchDarkly-style Control Plane
          </div>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            ControlPlane Console
          </h1>

          <p className="text-lg leading-7 text-muted-foreground">
            A LaunchDarkly-inspired developer platform for managing
            environments, API keys, audit logs, request logs, and usage
            analytics — built with Next.js, Neon Postgres, Prisma, and GitHub
            OAuth.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/console">Open Console</Link>
            </Button>

            <Button asChild variant="outline" size="lg">
              <Link href="/api/auth/signin">Sign in with GitHub</Link>
            </Button>

            <Button asChild variant="secondary" size="lg">
              <Link href="/docs/quickstart">Quickstart</Link>
            </Button>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span>Multi-tenant: Org → Project → Env</span>
            <span>Hash-only API keys</span>
            <span>Published snapshots</span>
          </div>
        </div>

        {/* “Product” summary cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage Analytics</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Hourly buckets, event counts, request counts, and average latency
              per project.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request Logs</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Cursor-paginated logs with filters (env, key, status, search) and
              “load more”.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit Log</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Org-scoped audit trail with actor details, filters, and stable
              pagination.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">API Keys</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Prefix + secret keys, stored as SHA-256 hashes only. Supports
              environment scoping.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Explore */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">
          Explore what’s built so far
        </h2>
        <p className="text-muted-foreground">
          If you’re evaluating the product (or my engineering work), these pages
          show the system end-to-end: console UX, internal APIs, and data
          models.
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Docs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              Product overview and quickstart.
              <div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/docs">Open Docs</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Changelog</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              Track MVP progress and releases.
              <div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/changelog">View Changelog</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              Pricing page stub for product positioning.
              <div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/pricing">See Pricing</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Console</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              Org/project/env hierarchy and dashboards.
              <div>
                <Button asChild size="sm">
                  <Link href="/console">Open Console</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Architecture */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Architecture</h2>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Control Plane</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <div>Next.js App Router + Server Components</div>
              <div>shadcn/ui + Tailwind UI system</div>
              <div>Org/project/environment management</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data & Auth</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <div>Neon Postgres + Prisma</div>
              <div>Auth.js / NextAuth (GitHub OAuth)</div>
              <div>Hash-only API key auth for SDK endpoints</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Data Plane (in progress)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <div>Published snapshots (immutable config)</div>
              <div>/v1/config supports ETag + 304 revalidation</div>
              <div>Next: streaming updates (SSE) + evaluation</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <section className="border-t pt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} ControlPlane Console
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/privacy"
            >
              Privacy
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/terms"
            >
              Terms
            </Link>
            <Link
              className="text-muted-foreground hover:text-foreground"
              href="/status"
            >
              Status
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
