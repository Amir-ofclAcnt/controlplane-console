/* scripts/backfill-audit-scope.ts */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { Prisma } from "@prisma/client";

async function countNulls(label: string) {
  const rows = await prisma.$queryRaw<
    Array<{ total: bigint; project_null: bigint; env_null: bigint }>
  >`
    select
      count(*) as total,
      sum(case when "projectId" is null then 1 else 0 end) as project_null,
      sum(case when "environmentId" is null then 1 else 0 end) as env_null
    from "AuditLog";
  `;

  const r = rows[0]!;
  console.log(
    `[${label}] total=${Number(r.total)} project_null=${Number(
      r.project_null
    )} env_null=${Number(r.env_null)}`
  );
}

async function tableExists(quotedTableName: string) {
  // quotedTableName must include quotes like: '"FlagEnvironmentState"'
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    select to_regclass('public.${quotedTableName}') is not null as exists
  `;
  return Boolean(rows[0]?.exists);
}

async function getColumns(tableName: string) {
  // tableName without quotes: FlagEnvironmentState
  const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = ${tableName}
  `;
  return new Set(cols.map((c) => c.column_name));
}

async function main() {
  await countNulls("before");

  // ------------------------------------------------------------
  // 1) Backfill projectId for targetType=project (robust match)
  // ------------------------------------------------------------
  const updatedProject = await prisma.$executeRaw`
    update "AuditLog"
    set "projectId" = "targetId"
    where "projectId" is null
      and lower(trim("targetType")) = 'project';
  `;
  console.log(`Updated project-scoped rows: ${updatedProject}`);

  await countNulls("after-project");

  // ------------------------------------------------------------
  // 2) Backfill for targetType=flagEnvironmentState
  // Infer:
  //   AuditLog.targetId -> FlagEnvironmentState.id
  //   FlagEnvironmentState.environmentId/envId -> Environment.id -> Environment.projectId
  // Fill ANY missing scope fields (projectId OR environmentId).
  // ------------------------------------------------------------
  const fesQuoted = `"FlagEnvironmentState"`;
  const fesExists = await tableExists(fesQuoted);

  if (!fesExists) {
    console.warn(
      `WARNING: Table ${fesQuoted} does not exist in public schema. Skipping flagEnvironmentState backfill.`
    );
    await countNulls("after-flagEnvironmentState-skip");
    return;
  }

  const fesCols = await getColumns("FlagEnvironmentState");

  const envFk = fesCols.has("environmentId")
    ? "environmentId"
    : fesCols.has("envId")
    ? "envId"
    : null;

  if (!envFk) {
    console.warn(
      `WARNING: ${fesQuoted} does not have environmentId/envId column. Available columns: ${[
        ...fesCols,
      ].join(", ")}`
    );
    await countNulls("after-flagEnvironmentState-skip");
    return;
  }

  // Build a safe SQL fragment for the dynamic column name
  const envFkRaw = Prisma.raw(`"${envFk}"`);

  // Important change:
  // - WHERE matches targetType case-insensitively
  // - runs when projectId OR environmentId is null (not only projectId)
  const updatedFlagEnvState = await prisma.$executeRaw(Prisma.sql`
    update "AuditLog" a
    set
      "environmentId" = coalesce(a."environmentId", fes.${envFkRaw}),
      "projectId"     = coalesce(a."projectId", e."projectId")
    from "FlagEnvironmentState" fes
    join "Environment" e on e."id" = fes.${envFkRaw}
    where (a."projectId" is null or a."environmentId" is null)
      and lower(trim(a."targetType")) = 'flagenvironmentstate'
      and a."targetId" = fes."id";
  `);

  console.log(`Updated flagEnvironmentState rows: ${updatedFlagEnvState}`);

  await countNulls("after");

  // ------------------------------------------------------------
  // 3) If anything is still null, print a quick breakdown
  // ------------------------------------------------------------
  const remaining = await prisma.$queryRaw<
    Array<{ targetType: string; action: string; cnt: bigint }>
  >`
    select "targetType", "action", count(*) as cnt
    from "AuditLog"
    where "projectId" is null
       or "environmentId" is null
    group by "targetType", "action"
    order by cnt desc;
  `;

  if (remaining.length > 0) {
    console.log("Remaining rows with NULL scope (by targetType/action):");
    for (const r of remaining) {
      console.log(
        `- targetType=${r.targetType} action=${r.action} count=${Number(r.cnt)}`
      );
    }
  } else {
    console.log("No remaining NULL scope rows.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
