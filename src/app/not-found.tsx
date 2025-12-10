import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">
          The page you’re looking for doesn’t exist or was moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link className="rounded border px-4 py-2 text-sm hover:bg-muted" href="/">
            Home
          </Link>
          <Link className="rounded border px-4 py-2 text-sm hover:bg-muted" href="/console">
            Console
          </Link>
        </div>
      </div>
    </div>
  );
}
