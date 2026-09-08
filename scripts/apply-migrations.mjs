// Applies migration SQL files to the live Supabase database through the
// service-role REST endpoint (no separate DB credentials needed).
//
// Usage:
//   node scripts/apply-migrations.mjs [file1.sql file2.sql ...]
//   # no args -> apply the newest unapplied migration in supabase/migrations
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
// When the migrations were previously applied via the CLI, their versions live
// in supabase_migrations.schema_migrations and are skipped automatically.

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");

function loadEnv() {
  const raw = readFileSync(resolve(root, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[m[1]] = value;
  }
  return env;
}

async function pg({ url, serviceKey }, query, params = []) {
  const res = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, parameters: params }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`PG ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// Connectivity probe
try {
  await pg({ url, serviceKey }, "select 1 as ok");
  console.log("Connected to", url);
} catch (err) {
  console.error("Connection failed:", err.message);
  process.exit(1);
}

// Which versions are already applied?
const applied = new Set();
try {
  const rows = await pg(
    { url, serviceKey },
    "select name from supabase_migrations.schema_migrations order by version",
  );
  for (const r of rows) applied.add(String(r.name));
  console.log(`Already applied: ${applied.size ? [...applied].join(", ") : "none tracked"}`);
} catch {
  console.log("No version table found — proceeding with explicit files only.");
}

const allSql = readdirSync(resolve(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const requested = process.argv.slice(2);
const files = requested.length
  ? requested.map((p) => resolve(p))
  : allSql
      .filter((f) => !applied.has(f))
      .map((f) => resolve(root, "supabase/migrations", f));

if (!requested.length && !files.length) {
  console.log("Everything already applied. Nothing to do.");
  process.exit(0);
}

for (const file of files) {
  const relative = file.replace(resolve(root) + "\\", "").replace(/\\/g, "/");
  if (!file.endsWith(".sql")) {
    console.error("Not a .sql file:", file);
    process.exit(1);
  }
  console.log(`\n=== Applying ${relative} ===`);
  const sql = readFileSync(file, "utf8");
  try {
    await pg({ url, serviceKey }, sql);
    console.log("OK");
  } catch (err) {
    console.error("FAILED:\n", err.message);
    process.exit(1);
  }
}

console.log("\nAll migrations applied.");

function baseName(f) {
  return f.split(/[\\/]/).pop();
}