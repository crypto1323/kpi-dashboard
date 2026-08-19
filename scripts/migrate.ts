import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Add it to .env.local (Project Settings > Database > Connection string, Transaction pooler recommended) and re-run with:\n" +
      "  npx tsx --env-file=.env.local scripts/migrate.ts",
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function main() {
  await sql`
    create table if not exists public._migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const appliedRows = await sql`select name from public._migrations`;
  const applied = new Set(appliedRows.map((row) => row.name as string));

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const contents = readFileSync(join(dir, file), "utf8");
    console.log(`apply  ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`insert into public._migrations (name) values (${file})`;
    });
    appliedCount += 1;
  }

  console.log(
    appliedCount > 0
      ? `Applied ${appliedCount} migration(s).`
      : "Already up to date.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
