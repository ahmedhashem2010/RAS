"use strict";

// ============================================================
// RAS — DB regression suite (real-JWT/RLS harness)
//
// Every check runs inside a transaction that is ROLLED BACK on
// exit, so no persistent state is modified. Authorization is
// enforced exactly as Supabase would:
//   - SET ROLE authenticated
//   - request.jwt.claims = { sub: <user>, role: 'authenticated' }
//   - direct SQL through the RLS policies / SECURITY DEFINER
//     helpers / BEFORE triggers
//
// Roles:
//   S1  Probe Super Admin        G   Probe General Admin
//   X   temp volunteer (committee leader)   VA  Probe Volunteer A
//   VB  Probe Volunteer B        LB  temp volunteer (banned in tests)
//
// Committees:
//   A  led by X, members VA + X      B  led by VB, member VB
//
// Run:  set RAS_DB_PASSWORD=... && node scripts\db-regression.cjs
// ============================================================

const pg = require("pg");

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

const S1 = "60e38beb-bff1-4c3c-a222-9c8d96d6507d"; // Probe Super Admin
const G = "9fd0c126-fc97-4770-abb8-497875b818ce"; // Probe General Admin
const X = "ad3e0c9f-5a79-4efd-9cbc-805ac1561257"; // temp volunteer -> committee A leader
const VA = "891b7d44-7326-450d-b0ee-85a48e4dc1fa"; // Probe Volunteer A -> member of A
const VB = "54770274-ef05-40bd-813b-9e92253215e9"; // Probe Volunteer B -> leader/member of B
const LB = "52d06e24-8dfd-40ce-87a2-86aac70174cc"; // temp volunteer -> banned in tests

async function main() {
  await client.connect();
let pass = 0;
let fail = 0;
const report = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}  <- ${detail}`);
  }
};

async function run(sql) {
  await client.query("savepoint sp");
  try {
    const r = await client.query(sql);
    await client.query("release savepoint sp");
    return r;
  } catch (e) {
    await client.query("rollback to savepoint sp");
    throw e;
  }
}
const exec = (sql) => run(sql);

async function expErr(sql, match, name) {
  try {
    await run(sql);
    report(name, false, "expected error, got success");
  } catch (e) {
    report(name, e.message.includes(match), `got: ${e.message.slice(0, 110)}`);
  }
}
async function expRows(sql, n, name) {
  try {
    const r = await run(sql);
    report(name, r.rowCount === n, `rowCount=${r.rowCount}, expected=${n}`);
  } catch (e) {
    report(name, false, `error: ${e.message.slice(0, 110)}`);
  }
}
async function expEq(sql, expected, name) {
  try {
    const r = await run(sql);
    const key = Object.keys(r.rows[0] || {})[0];
    const v = r.rows[0] ? r.rows[0][key] : undefined;
    report(name, String(v) === String(expected), `got=${JSON.stringify(v)}, expected=${JSON.stringify(expected)}`);
  } catch (e) {
    report(name, false, `error: ${e.message.slice(0, 110)}`);
  }
}
async function expNum(sql, expected, name) {
  try {
    const r = await run(sql);
    const key = Object.keys(r.rows[0] || {})[0];
    const v = r.rows[0] ? parseFloat(r.rows[0][key]) : NaN;
    report(name, Math.abs(v - expected) < 0.01, `got=${v}, expected=${expected}`);
  } catch (e) {
    report(name, false, `error: ${e.message.slice(0, 110)}`);
  }
}
async function expNull(sql, name) {
  try {
    const r = await run(sql);
    const key = Object.keys(r.rows[0] || {})[0];
    const v = r.rows[0] ? r.rows[0][key] : undefined;
    report(name, v === null, `got=${JSON.stringify(v)}, expected=null`);
  } catch (e) {
    report(name, false, `error: ${e.message.slice(0, 110)}`);
  }
}

const claims = (sub) =>
  client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated" })]);
const uuid = () => crypto.randomUUID();

// Seed one committee graph: committee A (leader X, members X+VA) and
// committee B (leader VB, member VB). Returns volunteer + committee ids.
async function seedCommittees() {
  const dA = (await exec(`insert into public.departments (name, name_en) values ('Reg-A-${Date.now()}','reg_a') returning id`)).rows[0].id;
  const dB = (await exec(`insert into public.departments (name, name_en) values ('Reg-B-${Date.now()}','reg_b') returning id`)).rows[0].id;
  const volX = (await exec(`insert into public.volunteers (profile_id, full_name, search_name) values ('${X}','Gen X','gen x') returning id`)).rows[0].id;
  const volVA = (await exec(`insert into public.volunteers (profile_id, full_name, search_name) values ('${VA}','Gen VA','gen va') returning id`)).rows[0].id;
  const volVB = (await exec(`insert into public.volunteers (profile_id, full_name, search_name) values ('${VB}','Gen VB','gen vb') returning id`)).rows[0].id;
  await exec(`insert into public.committee_leaders (committee_id, leader_id, created_by) values ('${dA}','${volX}','${S1}')`);
  await exec(`insert into public.committee_leaders (committee_id, leader_id, created_by) values ('${dB}','${volVB}','${S1}')`);
  await exec(`insert into public.committee_members (committee_id, volunteer_id) values ('${dA}','${volX}'), ('${dA}','${volVA}')`);
  await exec(`insert into public.committee_members (committee_id, volunteer_id) values ('${dB}','${volVB}')`);
  return { dA, dB, volX, volVA, volVB };
}

async function scenario(label, setupFn, testFn) {
  await client.query("begin");
  try {
    const ctx = await setupFn();
    await client.query("set role authenticated");
    console.log(`\n[${label}]`);
    await testFn(ctx);
  } catch (e) {
    console.log(`  SCENARIO ERROR: ${e.message}`);
    fail++;
  } finally {
    await client.query("rollback");
    await client.query("reset role");
  }
}

// ============================================================
// FOLDED HIGH-PRIORITY CHECKS (27)
// ============================================================

await scenario("HIGH #1 status hierarchy", async () => {}, async () => {
  await claims(G);
  await expErr(`update public.profiles set status='banned' where id='${S1}'`, "super admin status", "GENERAL_ADMIN -> SUPER_ADMIN = BLOCKED");
  await expRows(`update public.profiles set status='banned' where id='${VA}'`, 1, "GENERAL_ADMIN -> volunteer = PASS");
  await expRows(`update public.profiles set status='banned' where id='${G}'`, 1, "GENERAL_ADMIN -> general_admin (self/peer) = PASS");
  await claims(S1);
  await expRows(`update public.profiles set status='banned' where id='${VA}'`, 1, "SUPER_ADMIN -> volunteer = PASS");
  await expRows(`update public.profiles set status='banned' where id='${G}'`, 1, "SUPER_ADMIN -> general_admin = PASS");
  await claims(VA);
  await expRows(`update public.profiles set status='banned' where id='${G}'`, 0, "VOLUNTEER -> anyone = BLOCKED (0 rows)");
  await claims(S1);
  await run(`update public.profiles set status='banned' where id='${VA}'`);
  await claims(VA);
  await expErr(`update public.profiles set status='active' where id='${VA}'`, "Only an admin", "BANNED self-unban = BLOCKED");
  await expRows(`update public.profiles set status='active' where id='${S1}'`, 0, "BANNED -> super_admin = BLOCKED (0 rows)");
});

// Assignment targets: admins/committee leaders assign to ACTIVE members of
// the committees they lead (or themselves); nobody assigns banned users.
await scenario("HIGH #2 assignment targets", async () => {
  await seedCommittees();
  await exec(`update public.profiles set status='banned' where id='${LB}'`);
  const t1 = (await exec(`insert into public.tasks (title, created_by) values ('tA','${X}') returning id`)).rows[0].id;
  const t2 = (await exec(`insert into public.tasks (title, created_by) values ('tB','${VB}') returning id`)).rows[0].id;
  return { t1, t2 };
}, async ({ t1, t2 }) => {
  await claims(X);
  await expRows(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${VA}')`, 1, "LEADER A -> A active member = PASS");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${VB}')`, "not in a committee you lead", "LEADER A -> B member = BLOCKED");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${LB}')`, "non-active", "LEADER A -> banned = BLOCKED");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}', '${uuid()}')`, "does not exist", "LEADER A -> unknown user = BLOCKED");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${X}'), ('${t1}','${LB}')`, "non-active", "LEADER A bulk incl banned = BLOCKED (atomic)");
  await expRows(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${X}')`, 1, "LEADER A self-assign = PASS");
  await claims(G);
  await expRows(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${VB}')`, 1, "ADMIN global assignment = PASS");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${LB}')`, "non-active", "ADMIN -> banned = BLOCKED");
  await claims(S1);
  await expRows(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${X}')`, 1, "SUPER_ADMIN global assignment = PASS");
  await claims(VA);
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${VA}')`, "row-level security", "VOLUNTEER arbitrary assignment = BLOCKED (RLS)");
  await claims(VB);
  await expRows(`insert into public.task_assignments (task_id, volunteer_id) values ('${t2}','${VB}')`, 1, "LEADER B self-assign = PASS");
});

// ============================================================
// COMMITTEE MANAGEMENT + AUDIT (0013/0015/0018)
// ============================================================

await scenario("COMMITTEE MANAGEMENT + AUDIT", async () => {
  await seedCommittees();
  const dC = (await exec(`insert into public.departments (name, name_en) values ('Reg-C-${Date.now()}','reg_c') returning id`)).rows[0].id;
  return { dC };
}, async ({ dC }) => {
  await claims(S1);
  await expRows(`insert into public.departments (name, name_en) values ('Reg-New-${Date.now()}','reg_new')`, 1, "SUPER_ADMIN creates department = PASS");
  await claims(G);
  await expErr(`insert into public.departments (name, name_en) values ('Reg-New2-${Date.now()}','reg_new2')`, "row-level security", "GENERAL_ADMIN creates department = BLOCKED (RLS)");
  await expErr(`insert into public.committee_leaders (committee_id, leader_id, created_by) values ('${dC}','${(await run('select id from public.volunteers limit 1')).rows[0].id}','${G}')`, "row-level security", "GENERAL_ADMIN sets leader = BLOCKED (RLS)");
  await claims(S1);
  await expRows(`insert into public.committee_members (committee_id, volunteer_id) select '${dC}', id from public.volunteers limit 1`, 1, "SUPER_ADMIN adds member = PASS");
  await claims(G);
  await expRows(`insert into public.committee_members (committee_id, volunteer_id) select '${dC}', id from public.volunteers limit 1`, 1, "GENERAL_ADMIN adds member = PASS");
  await claims(X);
  await expErr(`insert into public.committee_members (committee_id, volunteer_id) select '${dC}', id from public.volunteers limit 1`, "row-level security", "LEADER A adds member elsewhere = BLOCKED (RLS)");
  const vx = (await run(`select id from public.volunteers where profile_id='${X}' limit 1`)).rows[0].id;
  const vva = (await run(`select id from public.volunteers where profile_id='${VA}' limit 1`)).rows[0].id;
  await expRows(`update public.volunteers set full_name='New X' where id='${vx}' and profile_id='${X}'`, 1, "LEADER edits own roster row = PASS");
  await expRows(`update public.volunteers set full_name='New VA' where id='${vva}'`, 1, "LEADER edits committee member roster = PASS");
  await expErr(`update public.volunteers set status='inactive' where id='${vva}'`, "Only an admin", "LEADER changes member status = BLOCKED");
  await expErr(`update public.volunteers set rating=5 where id='${vva}'`, "Only an admin", "LEADER sets standing rating = BLOCKED");
  await claims(VA);
  await expErr(`update public.volunteers set full_name='Hax' where id='${vx}'`, "Only an admin or the committee leader", "MEMBER edits leader roster = BLOCKED");
  await claims(X);
  await expRows(`select public.log_audit('attendance_changed','convoy',null)`, 1, "LEADER audits attendance action = PASS");
  await expRows(`select public.log_audit('volunteer_updated','volunteer','${vva}')`, 1, "LEADER audits committee-member edit = PASS");
  await claims(VA);
  await expErr(`select public.log_audit('attendance_changed','convoy',null)`, "Not authorized", "VOLUNTEER audits leader action = BLOCKED");
  await expErr(`select public.log_audit('member_added','team','${dC}')`, "Unknown audit action", "TEAM audit actions removed = BLOCKED");
  await expErr(`select public.log_audit('member_left_team','team','${dC}')`, "Unknown audit action", "TEAM leave action removed = BLOCKED");
});

// ============================================================
// FOCUSED SCENARIO — TASK LIFECYCLE (0001/0007/0008/0011/0018)
// ============================================================

await scenario("TASK LIFECYCLE", async () => {
  await seedCommittees();
  const t1 = (await exec(`insert into public.tasks (title, created_by) values ('t1','${X}') returning id`)).rows[0].id;
  const t2 = (await exec(`insert into public.tasks (title, created_by) values ('t2','${X}') returning id`)).rows[0].id;
  const t3 = (await exec(`insert into public.tasks (title, created_by) values ('t3','${X}') returning id`)).rows[0].id;
  const t4 = (await exec(`insert into public.tasks (title, created_by) values ('t4','${VB}') returning id`)).rows[0].id;
  const a1 = (await exec(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${VA}') returning id`)).rows[0].id;
  const a3 = (await exec(`insert into public.task_assignments (task_id, volunteer_id) values ('${t3}','${X}') returning id`)).rows[0].id;
  const a4 = (await exec(`insert into public.task_assignments (task_id, volunteer_id) values ('${t4}','${VB}') returning id`)).rows[0].id;
  return { t1, t2, t3, t4, a1, a3, a4 };
}, async ({ t1, t2, t3, t4, a1, a3, a4 }) => {
  await claims(X);
  await expRows(`insert into public.tasks (title, created_by) values ('tNew','${X}')`, 1, "COMMITTEE LEADER creates task = PASS");
  await claims(VA);
  await expErr(`insert into public.tasks (title, created_by) values ('tV','${VA}')`, "row-level security", "VOLUNTEER creates task = BLOCKED (RLS)");
  await expRows(`update public.task_assignments set status='in_progress' where id='${a1}'`, 1, "ASSIGNEE starts own task = PASS");
  await expRows(`update public.task_assignments set status='submitted', proof_url='https://x.test/p' where id='${a1}'`, 1, "ASSIGNEE submits own task = PASS");
  await claims(X);
  await expRows(`select 1 from public.notifications where user_id='${X}' and type='task_submitted' limit 1`, 1, "SUBMIT notifies task creator = PASS");
  await claims(VA);
  await expRows(`update public.task_assignments set status='submitted', rating=5, reviewed_by='${S1}', reviewed_at=now(), review_comment='hack' where id='${a1}'`, 1, "ASSIGNEE tamper update lands = PASS");
  await expNull(`select rating from public.task_assignments where id='${a1}'`, "TAMPER rating guarded (reset) = PASS");
  await expNull(`select reviewed_by from public.task_assignments where id='${a1}'`, "TAMPER reviewed_by guarded (reset) = PASS");
  await expNull(`select review_comment from public.task_assignments where id='${a1}'`, "TAMPER review_comment guarded (reset) = PASS");
  await claims(X);
  await expRows(`update public.task_assignments set status='approved', rating=4, review_comment='great', reviewed_by='${X}' where id='${a1}'`, 1, "AUTHOR approves submitted task = PASS");
  await expEq(`select status from public.task_assignments where id='${a1}'`, "approved", "APPROVE sets status = approved");
  await claims(VA);
  await expRows(`select 1 from public.notifications where user_id='${VA}' and type='task_approved' limit 1`, 1, "APPROVE notifies assignee = PASS");
  await claims(X);
  await expRows(`insert into public.task_assignments (task_id, volunteer_id) values ('${t2}','${VA}')`, 1, "LEADER assigns second task = PASS");
  await claims(VA);
  await expRows(`update public.task_assignments set status='submitted', proof_url='https://x.test/p2' where id=(select id from public.task_assignments where task_id='${t2}' limit 1)`, 1, "ASSIGNEE submits second task = PASS");
  await claims(X);
  await expRows(`update public.task_assignments set status='rejected', review_comment='redo', reviewed_by='${X}' where id=(select id from public.task_assignments where task_id='${t2}' limit 1)`, 1, "AUTHOR rejects submission = PASS");
  await claims(VA);
  await expRows(`select 1 from public.notifications where user_id='${VA}' and type='task_rejected' limit 1`, 1, "REJECT notifies assignee = PASS");
  await claims(X);
  await expRows(`update public.task_assignments set status='pending', review_comment=null where id=(select id from public.task_assignments where task_id='${t2}' limit 1)`, 1, "AUTHOR reopens rejected task = PASS");
  await expEq(`select status from public.task_assignments where id=(select id from public.task_assignments where task_id='${t2}' limit 1)`, "pending", "REOPEN sets status = pending");
  await claims(VA);
  await expRows(`update public.task_assignments set status='approved', rating=5 where id='${a3}'`, 0, "VOLUNTEER reviews others' assignment = BLOCKED (0 rows)");
  await claims(X);
  await expRows(`update public.task_assignments set status='rejected' where id='${a4}'`, 0, "LEADER A reviews another author's assignment = BLOCKED (0 rows)");
  await claims(VB);
  await expRows(`update public.task_assignments set status='approved', rating=4, reviewed_by='${VB}' where id='${a4}'`, 1, "AUTHOR B reviews own task = PASS");
  await claims(VA);
  await expRows(`delete from public.task_assignments where id='${a3}'`, 0, "VOLUNTEER deletes others' assignment = BLOCKED (0 rows)");
});

// ============================================================
// FOCUSED SCENARIO — CONVOY LIFECYCLE (0015/0016)
// ============================================================

await scenario("CONVOY LIFECYCLE", async () => {
  const { dA, volX, volVA } = await seedCommittees();
  return { dA, volX, volVA };
}, async ({ dA, volX, volVA }) => {
  const mk = (name, status) =>
    exec(`insert into public.convoys (name, type, start_date, end_date, status, created_by) values ('${name}','normal',current_date,current_date,'${status}','${G}') returning id`)
      .then((r) => r.rows[0].id);
  await claims(S1);
  const c1 = await mk("c1", "upcoming");
  const c2 = await mk("c2", "active");
  // Super admin marks X as the leader who attended both convoys for committee A.
  await exec(`insert into public.convoy_leaders (convoy_id, leader_id, marked_by) values ('${c1}','${X}','${S1}'),('${c2}','${X}','${S1}')`);
  await claims(G);
  await expRows(`insert into public.convoys (name, type, start_date, end_date, created_by) values ('c1b','normal',current_date,current_date,'${G}')`, 1, "GENERAL_ADMIN creates convoy = PASS");
  await claims(VA);
  await expErr(`insert into public.convoys (name, type, start_date, end_date, created_by) values ('cV','normal',current_date,current_date,'${VA}')`, "row-level security", "VOLUNTEER creates convoy = BLOCKED (RLS)");
  await claims(G);
  await expRows(`update public.convoys set status='active' where id='${c1}'`, 1, "GENERAL_ADMIN starts convoy = PASS");
  await claims(X);
  await expRows(`insert into public.convoy_attendance (convoy_id, volunteer_id, committee_id, status, marked_by) values ('${c1}','${VA}','${dA}','present','${X}')`, 1, "LEADER marks attendance on active convoy = PASS");
  await claims(VA);
  await expErr(`insert into public.convoy_attendance (convoy_id, volunteer_id, committee_id, status, marked_by) values ('${c1}','${VA}','${dA}','present','${VA}')`, "row-level security", "VOLUNTEER marks own attendance = BLOCKED (RLS)");
  await claims(X);
  await expRows(`update public.convoy_attendance set status='absent' where convoy_id='${c1}' and volunteer_id='${VA}' and committee_id='${dA}'`, 1, "LEADER updates attendance = PASS");
  await expRows(`delete from public.convoy_attendance where convoy_id='${c1}' and volunteer_id='${VA}' and committee_id='${dA}'`, 1, "LEADER deletes attendance = PASS");
  await expRows(`insert into public.convoy_attendance (convoy_id, volunteer_id, committee_id, status, marked_by) values ('${c1}','${VA}','${dA}','present','${X}')`, 1, "LEADER marks VA present (for eval) = PASS");
  await expRows(`insert into public.convoy_evaluations (convoy_id, volunteer_id, committee_id, leader_id, rating, comment) values ('${c1}','${VA}','${dA}','${X}',5,'good')`, 1, "LEADER evaluates present volunteer = PASS");
  await claims(X);
  await expErr(`insert into public.convoy_evaluations (convoy_id, volunteer_id, committee_id, leader_id, rating, comment) values ('${c2}','${VA}','${dA}','${X}',4,null)`, "must be marked present", "LEADER evaluates not-present volunteer = BLOCKED");
  await claims(G);
  await expRows(`update public.convoys set status='completed' where id='${c1}'`, 1, "GENERAL_ADMIN completes convoy = PASS");
  await claims(X);
  await expErr(`insert into public.convoy_attendance (convoy_id, volunteer_id, committee_id, status, marked_by) values ('${c1}','${VA}','${dA}','present','${X}')`, "row-level security", "LEADER attendance on completed convoy = BLOCKED (RLS)");
  await expErr(`insert into public.convoy_evaluations (convoy_id, volunteer_id, committee_id, leader_id, rating, comment) values ('${c1}','${VA}','${dA}','${X}',3,null)`, "row-level security", "LEADER evaluation on completed convoy = BLOCKED (RLS)");
  await expRows(`update public.convoy_attendance set status='present' where convoy_id='${c1}' and volunteer_id='${VA}' and committee_id='${dA}'`, 0, "LEADER updates attendance on completed convoy = BLOCKED (0 rows)");
  await expRows(`insert into public.convoy_attendance (convoy_id, volunteer_id, committee_id, status, marked_by) values ('${c2}','${VA}','${dA}','present','${X}')`, 1, "LEADER marks VA present on active convoy (for eval) = PASS");
  await claims(VA);
  await expErr(`insert into public.convoy_evaluations (convoy_id, volunteer_id, committee_id, leader_id, rating, comment) values ('${c2}','${VA}','${dA}','${VA}',2,null)`, "row-level security", "VOLUNTEER evaluates on active convoy = BLOCKED (RLS)");
  await claims(G);
  await expRows(`update public.convoys set status='cancelled' where id='${c2}'`, 1, "GENERAL_ADMIN cancels convoy = PASS");
  await claims(X);
  await expErr(`insert into public.convoy_attendance (convoy_id, volunteer_id, committee_id, status, marked_by) values ('${c2}','${VA}','${dA}','present','${X}')`, "row-level security", "LEADER attendance on cancelled convoy = BLOCKED (RLS)");
  await expRows(`update public.convoys set status='completed' where id='${c2}'`, 0, "LEADER changes convoy status = BLOCKED (0 rows)");
});

// ============================================================
// FOCUSED SCENARIO — READ VISIBILITY (0008/0010/0018)
// ============================================================

await scenario("READ VISIBILITY", async () => {
  const { dA } = await seedCommittees();
  const t1 = (await exec(`insert into public.tasks (title, created_by) values ('rvT1','${X}') returning id`)).rows[0].id;
  const t2 = (await exec(`insert into public.tasks (title, created_by) values ('rvT2','${VB}') returning id`)).rows[0].id;
  const a1 = (await exec(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${VA}') returning id`)).rows[0].id;
  await exec(`update public.profiles set status='banned' where id='${LB}'`);
  const cc = (await exec(`insert into public.convoys (name, type, start_date, end_date, status, created_by) values ('rvC','normal',current_date,current_date,'upcoming','${G}') returning id`)).rows[0].id;
  await exec(`update public.convoys set status='active' where id='${cc}'`);
  await exec(`insert into public.convoy_attendance (convoy_id, volunteer_id, committee_id, status, marked_by) values ('${cc}','${VA}','${dA}','present','${X}'),('${cc}','${X}','${dA}','present','${X}')`);
  await exec(`update public.convoys set status='completed' where id='${cc}'`);
  return { a1, t1, t2, cc };
}, async ({ a1, t1, t2, cc }) => {
  await claims(LB);
  await expRows(`select 1 from public.tasks where id='${t1}' limit 1`, 0, "BANNED reads tasks = BLOCKED (0 rows)");
  await expRows(`select 1 from public.task_assignments where id='${a1}' limit 1`, 0, "BANNED reads task_assignments = BLOCKED (0 rows)");
  await expRows(`select 1 from public.convoys where id='${cc}' limit 1`, 1, "BANNED reads convoys = PASS (unfiltered by design)");
  await claims(VA);
  await expRows(`select 1 from public.tasks where id='${t1}' limit 1`, 1, "MEMBER reads assigned task = PASS");
  await expRows(`select 1 from public.task_assignments where id='${a1}' limit 1`, 1, "ASSIGNEE reads own assignment = PASS");
  await expRows(`select 1 from public.task_assignments where task_id='${t2}' limit 1`, 0, "MEMBER reads other author's assignment = BLOCKED (0 rows)");
  await claims(VB);
  await expRows(`select 1 from public.tasks where id='${t1}' limit 1`, 0, "OTHER-AUTHOR member reads task = BLOCKED (0 rows)");
  await claims(X);
  await expRows(`select 1 from public.tasks where id='${t1}' limit 1`, 1, "AUTHOR reads own task = PASS");
  await expRows(`select 1 from public.task_assignments where task_id='${t1}' limit 1`, 1, "AUTHOR reads own task's assignments = PASS");
  await claims(G);
  await expRows(`select 1 from public.tasks where id='${t1}' limit 1`, 1, "GENERAL_ADMIN reads any task = PASS");

  // Global leaderboard: full detail is unmasked for EVERYONE (0018).
  await claims(VA);
  await expNum(`select attendance_percent from public.get_global_leaderboard() where volunteer_id='${VA}'`, 100, "MEMBER sees full detail (unmasked) = PASS");
  await claims(VB);
  await expNum(`select attendance_percent from public.get_global_leaderboard() where volunteer_id='${VA}'`, 100, "OTHER member also sees full detail = PASS");
  await claims(X);
  await expNum(`select attendance_percent from public.get_global_leaderboard() where volunteer_id='${VA}'`, 100, "LEADER sees full detail = PASS");
  await claims(G);
  await expNum(`select attendance_percent from public.get_global_leaderboard() where volunteer_id='${VA}'`, 100, "GENERAL_ADMIN sees full detail = PASS");

  await claims(VA);
  await expRows(`select 1 from public.get_score('${VA}') limit 1`, 1, "MEMBER reads own score = PASS");
  await claims(VB);
  await expRows(`select 1 from public.get_score('${VA}') limit 1`, 0, "OTHER member reads score = BLOCKED (0 rows)");
  await claims(X);
  await expRows(`select 1 from public.get_score('${VA}') limit 1`, 1, "COMMITTEE LEADER reads member score = PASS");
  await claims(LB);
  await expRows(`select 1 from public.get_score('${VA}') limit 1`, 0, "BANNED reads score = BLOCKED (0 rows)");
  await claims(VA);
  await expRows(`select * from public.get_profiles(array['${VA}','${X}','${VB}','${G}']::uuid[]) where id='${VA}'`, 1, "MEMBER get_profiles sees self = PASS");
  await expRows(`select * from public.get_profiles(array['${VA}','${X}','${VB}','${G}']::uuid[]) where id='${VB}'`, 0, "MEMBER get_profiles hides unrelated peer = BLOCKED (0 rows)");
  await claims(X);
  await expRows(`select * from public.get_profiles(array['${VA}','${X}','${VB}','${G}']::uuid[]) where id='${VA}'`, 1, "COMMITTEE LEADER get_profiles sees committee member = PASS");
  await expRows(`select * from public.get_profiles(array['${VA}','${X}','${VB}','${G}']::uuid[]) where id='${VB}'`, 0, "COMMITTEE LEADER get_profiles hides other committee = BLOCKED (0 rows)");
  await claims(G);
  await expRows(`select * from public.get_profiles(array['${VA}','${X}','${VB}','${G}']::uuid[])`, 4, "GENERAL_ADMIN get_profiles = all = PASS");
  await claims(VA);
  await expRows(`select 1 from public.get_active_profiles() where id='${VA}' limit 1`, 1, "MEMBER get_active_profiles sees self = PASS");
  await expRows(`select 1 from public.get_active_profiles() where id='${X}' limit 1`, 0, "MEMBER get_active_profiles hides peers = BLOCKED (0 rows)");
  await claims(X);
  await expRows(`select 1 from public.get_active_profiles() where id='${VA}' limit 1`, 1, "LEADER get_active_profiles sees committee member = PASS");
  await expRows(`select 1 from public.get_active_profiles() where id='${VB}' limit 1`, 0, "LEADER get_active_profiles hides other committee = BLOCKED (0 rows)");
  await expRows(`select 1 from public.get_active_profiles() where id='${G}' limit 1`, 0, "LEADER get_active_profiles hides unrelated admin = BLOCKED (0 rows)");
  await expRows(`select 1 from public.get_all_scores() limit 1`, 0, "MEMBER get_all_scores = BLOCKED (0 rows)");
  await claims(G);
  await expRows(`select 1 from public.get_all_scores() limit 1`, 1, "GENERAL_ADMIN get_all_scores = PASS");
});

// ============================================================
// FOCUSED SCENARIO — SCORING (0001/0015)
// ============================================================

await scenario("SCORING", async () => {
  const { dA, volX, volVA } = await seedCommittees();
  await exec(`update public.profiles set join_date = current_date - interval '2 years' where id='${X}'`);
  const c1 = (await exec(`insert into public.convoys (name, type, start_date, end_date, status, created_by) values ('scC1','normal',current_date,current_date,'upcoming','${G}') returning id`)).rows[0].id;
  const c2 = (await exec(`insert into public.convoys (name, type, start_date, end_date, status, created_by) values ('scC2','normal',current_date,current_date,'upcoming','${G}') returning id`)).rows[0].id;
  await exec(`update public.convoys set status='active' where id in ('${c1}','${c2}')`);
  await exec(`insert into public.convoy_attendance (convoy_id, volunteer_id, committee_id, status, marked_by) values ('${c1}','${X}','${dA}','present','${X}'),('${c2}','${X}','${dA}','present','${X}')`);
  await exec(`update public.convoys set status='completed' where id in ('${c1}','${c2}')`);
  await exec(`insert into public.convoy_evaluations (convoy_id, volunteer_id, committee_id, leader_id, rating, comment) values ('${c1}','${X}','${dA}','${X}',3,null)`);
  const t1 = (await exec(`insert into public.tasks (title, created_by) values ('scT1','${X}') returning id`)).rows[0].id;
  await exec(`insert into public.task_assignments (task_id, volunteer_id, status, rating, reviewed_by) values ('${t1}','${X}','approved',4,'${G}')`);
  return { dA };
}, async ({ dA }) => {
  await claims(G);
  await expNum(`select attendance_opportunities from public.get_score('${X}')`, 2, "opportunities = 2 completed convoys = PASS");
  await expNum(`select attendance_points from public.get_score('${X}')`, 2, "attendance_points = 2 present = PASS");
  await expNum(`select attendance_percent from public.get_score('${X}')`, 100, "attendance_percent = 100 = PASS");
  await expNum(`select task_percent from public.get_score('${X}')`, 80, "task_percent (rating 4) = 80 = PASS");
  await expNum(`select convoy_percent from public.get_score('${X}')`, 60, "convoy_percent (rating 3) = 60 = PASS");
  await expNum(`select seniority_score from public.get_score('${X}')`, 10, "seniority_score (24 months) = 10 = PASS");
  await expNum(`select overall_score from public.get_score('${X}')`, 82, "overall_score = 30+24+18+10 = 82 = PASS");
  await expNum(`select approved_tasks from public.get_score('${X}')`, 1, "approved_tasks = 1 = PASS");
  await expNum(`select evaluations from public.get_score('${X}')`, 1, "convoy evaluations = 1 = PASS");
  await claims(X);
  await expRows(`select 1 from public.get_score('${X}') limit 1`, 1, "SELF reads own score = PASS");
  await claims(VB);
  await expRows(`select 1 from public.get_score('${X}') limit 1`, 0, "OTHER member reads score = BLOCKED (0 rows)");
});

console.log(`\n==== SUMMARY: ${pass} passed, ${fail} failed ====`);
await client.end();
process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});