// One-off: apply a single migration file directly via the pooler
// and track it in supabase_migrations.schema_migrations.
// Usage: node scripts/apply-one.mjs <migration-file>
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-one.mjs <migration-sql-file>");
  process.exit(2);
}

const PASSWORD = process.env.RAS_DB_PASSWORD;
if (!PASSWORD) {
  console.error("RAS_DB_PASSWORD env var is required");
  process.exit(2);
}

const client = new pg.Client({
  host: "aws-1-eu-west-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.huaybwldwkxnlfqzgtbq",
  database: "postgres",
  password: PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const sql = readFileSync(file, "utf8");
const baseName = file.split(/[\\/]/).pop();
const version = baseName.split("_")[0];

await client.connect();
try {
  await client.query(
    "create schema if not exists supabase_migrations",
  );
  await client.query(
    "create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[], created_at timestamptz default now())",
  );
  await client.query(sql);
  console.log(`Applied: ${baseName}`);
  await client.query(
    "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3) on conflict (version) do nothing",
    [version, baseName, []],
  );
  console.log(`Tracked: ${baseName}`);
  const r = await client.query(
    "select name from supabase_migrations.schema_migrations order by version",
  );
  console.log("Tracked versions:", r.rows.map((x) => x.name).join(", "));
} finally {
  await client.end();
}