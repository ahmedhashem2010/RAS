// Idempotent seeding of the Volunteers Management System:
//   1) ensures the 11 committees exist
//   2) creates roster volunteers + their committee memberships
//   3) creates committee leadership rows (leaders / deputies)
//   4) creates leader Auth accounts (name@ras.local logins) when the
//      account does not already exist, links the roster rows to the
//      profiles, and forces a first-login password change via
//      profiles.must_change_password.
//
// Usage:
//   RAS_TEMP_PASSWORD="..." node scripts/seed-volunteers.mjs
//
// RAS_TEMP_PASSWORD must be provided (never committed). It is the single
// temporary password all leader accounts start with; each leader must
// change it on first login.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

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

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const tempPassword = process.env.RAS_TEMP_PASSWORD || env.RAS_TEMP_PASSWORD;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!tempPassword || tempPassword.length < 8) {
  console.error(
    "RAS_TEMP_PASSWORD is required (>= 8 chars). Provide it as an env var, e.g.\n" +
      '  $env:RAS_TEMP_PASSWORD="..." ; node scripts/seed-volunteers.mjs',
  );
  process.exit(1);
}

const data = JSON.parse(
  readFileSync(resolve(root, "supabase/seed/volunteers.json"), "utf8"),
);

async function pg(query, parameters = []) {
  const res = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, parameters }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw new Error(`PG ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

// ---------- Committees ----------
const deptBySlug = {};
for (const d of data.committees) {
  const rows = await pg("select id from public.departments where name_en = $1", [d.name_en]);
  let id;
  if (rows.length) {
    id = rows[0].id;
  } else {
    const ins = await pg(
      "insert into public.departments (name, name_en, sort_order) values ($1, $2, $3) returning id",
      [d.name, d.name_en, d.sort_order],
    );
    id = ins[0].id;
    console.log(`committee created: ${d.name} (${d.name_en})`);
  }
  deptBySlug[d.name_en] = id;
}
console.log(`Departments ensured: ${Object.keys(deptBySlug).length}`);

// ---------- Volunteers ----------
async function ensureVolunteer(committeeId, name) {
  const existing = await pg(
    `select v.id from public.volunteers v
     join public.committee_members cm on cm.volunteer_id = v.id
     where v.full_name = $1 and cm.committee_id = $2 limit 1`,
    [name, committeeId],
  );
  if (existing.length) return existing[0].id;

  const ins = await pg(
    "insert into public.volunteers (full_name) values ($1) returning id",
    [name],
  );
  const vid = ins[0].id;
  await pg(
    "insert into public.committee_members (committee_id, volunteer_id) values ($1, $2)",
    [committeeId, vid],
  );
  return vid;
}

let createdVolunteers = 0;
for (const [slug, names] of Object.entries(data.volunteers)) {
  const committeeId = deptBySlug[slug];
  for (const name of names) {
    await ensureVolunteer(committeeId, name);
  }
  createdVolunteers += names.length;
}
console.log(`Volunteer rosters ensured (${createdVolunteers} rows across committees)`);

// ---------- Leadership ----------
for (const l of data.leaders) {
  const committeeId = deptBySlug[l.committee];
  const vid = await ensureVolunteer(committeeId, l.name);
  await pg(
    `insert into public.committee_leaders (committee_id, leader_id, is_deputy)
     values ($1, $2, $3)
     on conflict (committee_id, leader_id)
     do update set is_deputy = excluded.is_deputy`,
    [committeeId, vid, l.role === "deputy"],
  );
}
console.log(`Leadership rows ensured: ${data.leaders.length}`);

// ---------- Leader accounts ----------
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findProfileByEmail(email) {
  const rows = await pg("select id from public.profiles where email = $1 limit 1", [email]);
  return rows.length ? rows[0].id : null;
}

async function createAccount(username, name) {
  const email = `${username}@ras.local`;
  const existingProfileId = await findProfileByEmail(email);
  if (existingProfileId) {
    return { profileId: existingProfileId, created: false };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) {
    // A race or a user created without a profile -> handle gracefully.
    const again = await findProfileByEmail(email);
    if (again) return { profileId: again, created: false };
    throw new Error(`createUser failed for ${email}: ${error.message}`);
  }
  await pg("update public.profiles set must_change_password = true where id = $1", [data.user.id]);
  return { profileId: data.user.id, created: true };
}

// Pass A: create/collect accounts, keyed by full name (one account per person).
const accountsByName = {};
for (const l of data.leaders) {
  if (!l.username) continue; // deputy of a leader who has an account via another row
  const { profileId, created } = await createAccount(l.username, l.name);
  accountsByName[l.name] = accountsByName[l.name] || { profileId, created };
  if (created) {
    console.log(`account created: ${l.username}@ras.local (${l.name})`);
  } else {
    console.log(`account already exists: ${l.username}@ras.local (${l.name})`);
  }
}

// Pass B: link every leadership roster row to that person's profile.
let linked = 0;
for (const l of data.leaders) {
  const acc = accountsByName[l.name];
  if (!acc) continue;
  const committeeId = deptBySlug[l.committee];
  const vid = await pg(
    `select v.id from public.volunteers v
     join public.committee_members cm on cm.volunteer_id = v.id
     where v.full_name = $1 and cm.committee_id = $2 limit 1`,
    [l.name, committeeId],
  );
  if (!vid.length) continue;
  await pg("update public.volunteers set profile_id = $1 where id = $2", [acc.profileId, vid[0].id]);
  linked += 1;
}
console.log(`Leader roster rows linked to accounts: ${linked}`);

// ---------- Summary ----------
const totals = await pg(
  `select
     (select count(*) from public.volunteers) as volunteers,
     (select count(*) from public.committee_members) as memberships,
     (select count(*) from public.committee_leaders) as leadership,
     (select count(*) from public.departments) as departments,
     (select count(*) from public.profiles where role in ('general_admin','super_admin')) as admins`,
);
console.log("\n=== SEED SUMMARY ===");
console.log(totals[0]);
console.log("\nDone. Leader temporary password is shared (RAS_TEMP_PASSWORD); each account must change it on first login.");