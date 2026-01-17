import "dotenv/config";
import { prisma } from "../src/lib/db"; // IMPORTANT: reuse your configured prisma

type Row = {
  id: string;
  name: string;
  projectId: string;
  slug: string | null;
};

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Optional: LD-ish defaults if names look like these
function defaultSlugFromName(name: string) {
  const n = name.trim().toLowerCase();
  if (n === "production" || n === "prod") return "prod";
  if (n === "staging" || n === "stage") return "staging";
  if (n === "development" || n === "dev") return "dev";
  return null;
}

async function main() {
  // 1) Load envs that have NULL slug (RAW, because Prisma schema says slug is required)
  const envs = await prisma.$queryRaw<Row[]>`
    select "id", "name", "projectId", "slug"
    from "Environment"
    where "slug" is null
    order by "projectId" asc, "id" asc
  `;

  if (envs.length === 0) {
    console.log("No Environment rows with NULL slug. Nothing to backfill.");
    return;
  }

  // 2) Build a per-project set of existing slugs (including non-null ones)
  const existingRows = await prisma.$queryRaw<
    Array<{ projectId: string; slug: string }>
  >`
    select "projectId", "slug"
    from "Environment"
    where "slug" is not null
  `;

  const used = new Map<string, Set<string>>();
  for (const r of existingRows) {
    const set = used.get(r.projectId) ?? new Set<string>();
    set.add(r.slug);
    used.set(r.projectId, set);
  }

  // 3) Generate + update
  let updated = 0;

  for (const e of envs) {
    const base =
      defaultSlugFromName(e.name) ?? slugify(e.name) ?? `env-${e.id.slice(-6)}`;

    const set = used.get(e.projectId) ?? new Set<string>();
    used.set(e.projectId, set);

    let slug = base;
    let i = 2;
    while (set.has(slug)) {
      slug = `${base}-${i++}`;
    }

    // Mark as used so future envs in same project avoid collision
    set.add(slug);

    await prisma.$executeRaw`
      update "Environment"
      set "slug" = ${slug}
      where "id" = ${e.id} and "slug" is null
    `;

    updated++;
    console.log(`Backfilled env ${e.id} (${e.name}) -> slug="${slug}"`);
  }

  console.log(`Done. Updated ${updated} Environment rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
