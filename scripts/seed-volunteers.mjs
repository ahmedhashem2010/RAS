// Idempotent seeding of the Volunteers Management System via the
// Supabase JS client (REST + Auth Admin API). No /pg/query dependency.
//
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
// RAS_TEMP_PASSWORD must be provided (never committed).

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

// Service-role client: bypasses RLS for table operations and has auth admin access.
const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function check(label, { data: d, error }) {
  if (error) {
    console.error(`  FAIL [${label}]:`, error.message);
    throw new Error(`${label}: ${error.message}`);
  }
  return d;
}

// ─────────────────────────────────────────────────────
// 1. COMMITTEES (departments)
// ─────────────────────────────────────────────────────
const deptBySlug = {};

for (const d of data.committees) {
  const existing = check("dept-select",
    await sb.from("departments").select("id").eq("name_en", d.name_en).maybeSingle(),
  );
  if (existing) {
    deptBySlug[d.name_en] = existing.id;
  } else {
    const row = check("dept-insert",
      await sb.from("departments").insert({ name: d.name, name_en: d.name_en, sort_order: d.sort_order }).select("id").single(),
    );
    deptBySlug[d.name_en] = row.id;
    console.log(`  created: ${d.name} (${d.name_en})`);
  }
}
console.log(`Departments ensured: ${Object.keys(deptBySlug).length}`);

// ─────────────────────────────────────────────────────
// 2. VOLUNTEERS + COMMITTEE MEMBERSHIPS
// ─────────────────────────────────────────────────────
async function ensureVolunteer(committeeId, name) {
  // Find all volunteers with this full_name.
  const vols = check("vol-by-name",
    await sb.from("volunteers").select("id").eq("full_name", name),
  );
  if (vols && vols.length) {
    // Check if any are already in this committee.
    const volIds = vols.map((v) => v.id);
    const cm = check("cm-check",
      await sb.from("committee_members").select("volunteer_id")
        .eq("committee_id", committeeId)
        .in("volunteer_id", volIds)
        .limit(1),
    );
    if (cm && cm.length) return cm[0].volunteer_id;
  }

  // Volunteer does not exist in this committee — create.
  const newVol = check("vol-insert",
    await sb.from("volunteers").insert({ full_name: name }).select("id").single(),
  );
  const err2 = (await sb.from("committee_members").insert({ committee_id: committeeId, volunteer_id: newVol.id })).error;
  if (err2) throw new Error(`committee_members insert: ${err2.message}`);
  return newVol.id;
}

let rosterCount = 0;
for (const [slug, names] of Object.entries(data.volunteers)) {
  const committeeId = deptBySlug[slug];
  for (const name of names) {
    await ensureVolunteer(committeeId, name);
  }
  rosterCount += names.length;
}
console.log(`Volunteer rosters ensured (${rosterCount} rows across committees)`);

// ─────────────────────────────────────────────────────
// 3. LEADERSHIP
// ─────────────────────────────────────────────────────
for (const l of data.leaders) {
  const committeeId = deptBySlug[l.committee];
  const leaderId = await ensureVolunteer(committeeId, l.name);

  // Upsert: insert or update is_deputy on conflict (committee_id, leader_id).
  const existing = check("lead-check",
    await sb.from("committee_leaders").select("committee_id")
      .eq("committee_id", committeeId).eq("leader_id", leaderId).maybeSingle(),
  );
  if (existing) {
    await sb.from("committee_leaders").update({ is_deputy: l.role === "deputy" })
      .eq("committee_id", committeeId).eq("leader_id", leaderId);
  } else {
    await sb.from("committee_leaders").insert({
      committee_id: committeeId,
      leader_id: leaderId,
      is_deputy: l.role === "deputy",
    });
  }
}
console.log(`Leadership rows ensured: ${data.leaders.length}`);

// ─────────────────────────────────────────────────────
// 4. LEADER AUTH ACCOUNTS
// ─────────────────────────────────────────────────────
async function findProfileByEmail(email) {
  return check("profile-email",
    await sb.from("profiles").select("id").eq("email", email).maybeSingle(),
  );
}

async function createAccount(username, name) {
  const email = `${username}@ras.local`;
  const existing = await findProfileByEmail(email);
  if (existing) return { profileId: existing.id, created: false };

  const { data: userData, error } = await sb.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) {
    // Race or orphaned profile — check again.
    const retry = await findProfileByEmail(email);
    if (retry) return { profileId: retry.id, created: false };
    throw new Error(`createUser failed for ${email}: ${error.message}`);
  }

  // Mark must_change_password (profile created by handle_new_user trigger).
  await sb.from("profiles").update({ must_change_password: true }).eq("id", userData.user.id);
  return { profileId: userData.user.id, created: true };
}

// Pass A: create/collect accounts (one per unique person, keyed by name).
const accountsByName = {};
for (const l of data.leaders) {
  if (!l.username) continue;
  const { profileId, created } = await createAccount(l.username, l.name);
  accountsByName[l.name] = accountsByName[l.name] || { profileId, created };
  console.log(`  ${created ? "created" : "exists"}: ${l.username}@ras.local (${l.name})`);
}

// Pass B: link every leadership roster row to that person's profile.
let linked = 0;
for (const l of data.leaders) {
  const acc = accountsByName[l.name];
  if (!acc) continue;
  const committeeId = deptBySlug[l.committee];

  // Find the volunteer row for this person in this committee.
  const vols = check("vol-link",
    await sb.from("volunteers").select("id").eq("full_name", l.name),
  );
  if (!vols || !vols.length) continue;

  for (const v of vols) {
    const cm = check("cm-link",
      await sb.from("committee_members").select("volunteer_id")
        .eq("committee_id", committeeId).eq("volunteer_id", v.id).maybeSingle(),
    );
    if (cm) {
      await sb.from("volunteers").update({ profile_id: acc.profileId }).eq("id", v.id);
      linked++;
      break;
    }
  }
}
console.log(`Leader roster rows linked to accounts: ${linked}`);

// ─────────────────────────────────────────────────────
// 5. VERIFY — query live database and report real counts
// ─────────────────────────────────────────────────────
async function count(table, opts = {}) {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (opts.filter) {
    for (const [col, val] of Object.entries(opts.filter)) {
      if (Array.isArray(val)) q = q.in(col, val);
      else q = q.eq(col, val);
    }
  }
  const { count: c, error } = await q;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return c;
}

const departments = await count("departments");
const volunteers = await count("volunteers");
const memberships = await count("committee_members");
const leadership = await count("committee_leaders");
const admins = await count("profiles", { filter: { role: ["general_admin", "super_admin"] } });

// Count unique leader accounts (auth users with @ras.local email).
const { data: authUsers, error: listErr } = await sb.auth.admin.listUsers();
if (listErr) throw new Error(`listUsers: ${listErr.message}`);
const leaderAccounts = authUsers.users.filter((u) => u.email?.endsWith("@ras.local"));

console.log("\n=== SEED SUMMARY (live DB) ===");
console.log(`  departments:         ${departments}`);
console.log(`  volunteers:          ${volunteers}`);
console.log(`  committee_members:   ${memberships}`);
console.log(`  committee_leaders:   ${leadership}`);
console.log(`  leader accounts:     ${leaderAccounts.length}`);
console.log(`  profiles (admins):   ${admins}`);

// Per-committee leadership breakdown
const { data: leadRows } = await sb.from("committee_leaders")
  .select("committee_id, is_deputy, volunteers(full_name), departments(name_en)");
if (leadRows) {
  console.log("\n=== LEADERSHIP BY COMMITTEE ===");
  const byCommittee = {};
  for (const r of leadRows) {
    const slug = r.departments?.name_en || r.committee_id;
    if (!byCommittee[slug]) byCommittee[slug] = [];
    byCommittee[slug].push(`${r.volunteers?.full_name || "?"} (${r.is_deputy ? "deputy" : "leader"})`);
  }
  for (const [slug, names] of Object.entries(byCommittee).sort()) {
    console.log(`  ${slug}: ${names.join(", ")}`);
  }
}

// Verify حاتم سامح has exactly ONE account
const hatemAccounts = leaderAccounts.filter((u) =>
  u.email === "ras_doctors_leader_2@ras.local" ||
  u.user_metadata?.full_name === "د. حاتم سامح",
);
console.log(`\nحاتم سامح accounts: ${hatemAccounts.length} (${hatemAccounts.map((u) => u.email).join(", ") || "none"})`);

console.log("\nDone. Leader temporary password is shared (RAS_TEMP_PASSWORD); each account must change it on first login.");
