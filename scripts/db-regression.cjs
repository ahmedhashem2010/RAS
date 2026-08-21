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
//   X   temp volunteer (leader)  VA  Probe Volunteer A
//   VB  Probe Volunteer B        LB  temp volunteer (banned in tests)
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
const X = "ad3e0c9f-5a79-4efd-9cbc-805ac1561257"; // temp volunteer -> leader of team A
const VA = "891b7d44-7326-450d-b0ee-85a48e4dc1fa"; // Probe Volunteer A -> member/co-leader of A
const VB = "54770274-ef05-40bd-813b-9e92253215e9"; // Probe Volunteer B -> member of B
const LB = "52d06e24-8dfd-40ce-87a2-86aac70174cc"; // temp volunteer -> banned member / co-leader

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

await scenario("HIGH #2 assignment targets", async () => {
  const ta = (await exec(`insert into public.teams (name) values ('T-A-${Date.now()}') returning id`)).rows[0].id;
  const tb = (await exec(`insert into public.teams (name) values ('T-B-${Date.now()}') returning id`)).rows[0].id;
  await exec(`insert into public.team_leaders (team_id, leader_id) values ('${ta}', '${X}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${ta}', '${VA}'), ('${ta}', '${X}'), ('${ta}', '${LB}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${tb}', '${VB}')`);
  await exec(`update public.profiles set status='banned' where id='${LB}'`);
  const taskA = (await exec(`insert into public.tasks (title, team_id, created_by) values ('tA','${ta}','${X}') returning id`)).rows[0].id;
  const taskB = (await exec(`insert into public.tasks (title, team_id, created_by) values ('tB','${tb}','${VB}') returning id`)).rows[0].id;
  return { taskA, taskB };
}, async ({ taskA, taskB }) => {
  await claims(X);
  await expRows(`insert into public.task_assignments (task_id, volunteer_id) values ('${taskA}','${VA}')`, 1, "LEADER A -> A active member = PASS");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${taskA}','${VB}')`, "not a member", "LEADER A -> B member = BLOCKED");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${taskA}','${LB}')`, "non-active", "LEADER A -> banned A member = BLOCKED");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${taskB}','${VB}')`, "Only a leader of the task team", "LEADER A -> task in team B = BLOCKED (RLS)");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${taskA}', '${uuid()}')`, "does not exist", "LEADER A -> unknown user = BLOCKED");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${taskA}','${X}'), ('${taskA}','${LB}')`, "non-active", "LEADER A bulk incl banned = BLOCKED (atomic)");
  await claims(G);
  await expRows(`insert into public.task_assignments (task_id, volunteer_id) values ('${taskA}','${VB}')`, 1, "ADMIN global assignment = PASS");
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${taskA}','${LB}')`, "non-active", "ADMIN -> banned = BLOCKED");
  await claims(S1);
  await expRows(`insert into public.task_assignments (task_id, volunteer_id) values ('${taskA}','${X}')`, 1, "SUPER_ADMIN global assignment = PASS");
  await claims(VA);
  await expErr(`insert into public.task_assignments (task_id, volunteer_id) values ('${taskA}','${VA}')`, "Only a leader of the task team", "VOLUNTEER arbitrary assignment = BLOCKED (RLS)");
});

await scenario("HIGH #3 leader removal", async () => {
  const ta = (await exec(`insert into public.teams (name) values ('T-A-${Date.now()}') returning id`)).rows[0].id;
  const tb = (await exec(`insert into public.teams (name) values ('T-B-${Date.now()}') returning id`)).rows[0].id;
  const tc = (await exec(`insert into public.teams (name) values ('T-C-${Date.now()}') returning id`)).rows[0].id;
  await exec(`insert into public.team_leaders (team_id, leader_id) values ('${ta}','${X}'),('${ta}','${VA}'),('${ta}','${G}'),('${ta}','${S1}')`);
  await exec(`insert into public.team_leaders (team_id, leader_id) values ('${tb}','${VB}')`);
  await exec(`insert into public.team_leaders (team_id, leader_id) values ('${tc}','${LB}')`);
  return { ta, tb, tc };
}, async ({ ta, tb, tc }) => {
  await claims(X);
  await expRows(`delete from public.team_leaders where team_id='${ta}' and leader_id='${VA}'`, 1, "LEADER remove ordinary co-leader = PASS");
  await expErr(`delete from public.team_leaders where team_id='${ta}' and leader_id='${G}'`, "cannot remove an admin", "LEADER remove general_admin = BLOCKED");
  await expErr(`delete from public.team_leaders where team_id='${ta}' and leader_id='${S1}'`, "cannot remove an admin", "LEADER remove super_admin = BLOCKED");
  await expRows(`delete from public.team_leaders where team_id='${tb}' and leader_id='${VB}'`, 0, "LEADER A -> team B leader = BLOCKED (0 rows)");
  await expRows(`delete from public.team_leaders where team_id='${ta}' and leader_id='${X}'`, 1, "LEADER self-remove w/ other leader = PASS");
  await claims(LB);
  await expErr(`delete from public.team_leaders where team_id='${tc}' and leader_id='${LB}'`, "at least one leader", "LEADER self-remove as only leader = BLOCKED");
  await claims(VA);
  await expRows(`delete from public.team_leaders where team_id='${ta}' and leader_id='${G}'`, 0, "VOLUNTEER remove leader = BLOCKED (0 rows)");
  await claims(G);
  await expRows(`delete from public.team_leaders where team_id='${ta}' and leader_id='${S1}'`, 1, "GENERAL_ADMIN remove any leader = PASS");
  await claims(S1);
  await expRows(`delete from public.team_leaders where team_id='${ta}' and leader_id='${G}'`, 1, "SUPER_ADMIN remove any leader = PASS");
});

// ============================================================
// FOCUSED SCENARIO — LEADER PROMOTION / TEAM MANAGEMENT (0009)
// ============================================================

await scenario("LEADER PROMOTION (0009)", async () => {
  const ta = (await exec(`insert into public.teams (name) values ('LPA-${Date.now()}') returning id`)).rows[0].id;
  const tb = (await exec(`insert into public.teams (name) values ('LPB-${Date.now()}') returning id`)).rows[0].id;
  await exec(`insert into public.team_leaders (team_id, leader_id) values ('${ta}','${X}'),('${ta}','${LB}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${ta}','${VA}'),('${ta}','${X}'),('${ta}','${LB}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${tb}','${VB}')`);
  return { ta, tb };
}, async ({ ta, tb }) => {
  await claims(VA);
  await expRows(`delete from public.team_members where team_id='${ta}' and volunteer_id='${X}'`, 0, "VOLUNTEER removes other member = BLOCKED (0 rows)");
  await expErr(`insert into public.team_members (team_id, volunteer_id) values ('${tb}','${VA}')`, "row-level security", "VOLUNTEER self-add to team = BLOCKED (RLS)");
  await expErr(`insert into public.team_leaders (team_id, leader_id) values ('${ta}','${VB}')`, "row-level security", "VOLUNTEER promote co-leader = BLOCKED (RLS)");
  await claims(X);
  await expRows(`insert into public.team_leaders (team_id, leader_id) values ('${ta}','${VA}')`, 1, "LEADER promotes co-leader in own team = PASS");
  await expErr(`insert into public.team_leaders (team_id, leader_id) values ('${tb}','${VB}')`, "row-level security", "LEADER promote co-leader in other team = BLOCKED (RLS)");
  await expErr(`insert into public.team_leaders (team_id, leader_id) values ('${tb}','${X}')`, "cannot lead more than one team", "LEADER single-team trigger = BLOCKED");
  await expRows(`insert into public.team_members (team_id, volunteer_id) values ('${ta}','${VB}')`, 1, "LEADER adds member to own team = PASS");
  await expRows(`delete from public.team_members where team_id='${ta}' and volunteer_id='${VB}'`, 1, "LEADER removes member from own team = PASS");
  await claims(VA);
  await expRows(`delete from public.team_members where team_id='${ta}' and volunteer_id='${VA}'`, 1, "VOLUNTEER leaves own team (self) = PASS");
  await expRows(`delete from public.team_members where team_id='${ta}' and volunteer_id='${X}'`, 1, "CO-LEADER removes member = PASS (1 row)");
  await claims(S1);
  await run(`update public.profiles set status='banned' where id='${LB}'`);
  await claims(LB);
  await expErr(`insert into public.team_members (team_id, volunteer_id) values ('${ta}','${VB}')`, "row-level security", "BANNED co-leader add member = BLOCKED (RLS)");
  await expErr(`insert into public.team_leaders (team_id, leader_id) values ('${ta}','${VB}')`, "row-level security", "BANNED co-leader promote = BLOCKED (RLS)");
  await claims(X);
  await expRows(`select public.log_audit('member_added','team','${ta}')`, 1, "LEADER audits own-team action = PASS");
  await expErr(`select public.log_audit('member_added','team','${tb}')`, "Not authorized to write audit logs", "LEADER audits other-team action = BLOCKED");
  await claims(VA);
  await expRows(`select public.log_audit('member_left_team','team','${ta}')`, 1, "VOLUNTEER audits own leave = PASS");
  await expErr(`select public.log_audit('team_created','team','${ta}')`, "Not authorized to write audit logs", "VOLUNTEER audits admin action = BLOCKED");
  await claims(G);
  await expRows(`insert into public.team_leaders (team_id, leader_id) values ('${tb}','${VB}')`, 1, "GENERAL_ADMIN global leader write = PASS");
});

// ============================================================
// FOCUSED SCENARIO — TASK LIFECYCLE (0001/0007/0008/0011)
// ============================================================

await scenario("TASK LIFECYCLE", async () => {
  const ta = (await exec(`insert into public.teams (name) values ('TLA-${Date.now()}') returning id`)).rows[0].id;
  const tb = (await exec(`insert into public.teams (name) values ('TLB-${Date.now()}') returning id`)).rows[0].id;
  await exec(`insert into public.team_leaders (team_id, leader_id) values ('${ta}','${X}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${ta}','${VA}'),('${ta}','${X}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${tb}','${VB}')`);
  const t1 = (await exec(`insert into public.tasks (title, team_id, created_by) values ('t1','${ta}','${X}') returning id`)).rows[0].id;
  const t2 = (await exec(`insert into public.tasks (title, team_id, created_by) values ('t2','${ta}','${X}') returning id`)).rows[0].id;
  const t3 = (await exec(`insert into public.tasks (title, team_id, created_by) values ('t3','${ta}','${X}') returning id`)).rows[0].id;
  const t4 = (await exec(`insert into public.tasks (title, team_id, created_by) values ('t4','${tb}','${VB}') returning id`)).rows[0].id;
  const a1 = (await exec(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${VA}') returning id`)).rows[0].id;
  const a3 = (await exec(`insert into public.task_assignments (task_id, volunteer_id) values ('${t3}','${X}') returning id`)).rows[0].id;
  const a4 = (await exec(`insert into public.task_assignments (task_id, volunteer_id) values ('${t4}','${VB}') returning id`)).rows[0].id;
  return { ta, tb, t1, t2, t3, t4, a1, a3, a4 };
}, async ({ ta, tb, t1, t2, t3, t4, a1, a3, a4 }) => {
  await claims(X);
  await expRows(`insert into public.tasks (title, team_id, created_by) values ('tNew','${ta}','${X}')`, 1, "LEADER creates task in own team = PASS");
  await claims(VA);
  await expErr(`insert into public.tasks (title, team_id, created_by) values ('tV','${ta}','${VA}')`, "row-level security", "VOLUNTEER creates task = BLOCKED (RLS)");
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
  await expRows(`update public.task_assignments set status='approved', rating=4, review_comment='great', reviewed_by='${X}' where id='${a1}'`, 1, "LEADER approves submitted task = PASS");
  await expEq(`select status from public.task_assignments where id='${a1}'`, "approved", "APPROVE sets status = approved");
  await claims(VA);
  await expRows(`select 1 from public.notifications where user_id='${VA}' and type='task_approved' limit 1`, 1, "APPROVE notifies assignee = PASS");
  await claims(X);
  await expRows(`insert into public.task_assignments (task_id, volunteer_id) values ('${t2}','${VA}')`, 1, "LEADER assigns second task = PASS");
  await claims(VA);
  await expRows(`update public.task_assignments set status='submitted', proof_url='https://x.test/p2' where id=(select id from public.task_assignments where task_id='${t2}' limit 1)`, 1, "ASSIGNEE submits second task = PASS");
  await claims(X);
  await expRows(`update public.task_assignments set status='rejected', review_comment='redo', reviewed_by='${X}' where id=(select id from public.task_assignments where task_id='${t2}' limit 1)`, 1, "LEADER rejects submission = PASS");
  await claims(VA);
  await expRows(`select 1 from public.notifications where user_id='${VA}' and type='task_rejected' limit 1`, 1, "REJECT notifies assignee = PASS");
  await claims(X);
  await expRows(`update public.task_assignments set status='pending', review_comment=null where id=(select id from public.task_assignments where task_id='${t2}' limit 1)`, 1, "LEADER reopens rejected task = PASS");
  await expEq(`select status from public.task_assignments where id=(select id from public.task_assignments where task_id='${t2}' limit 1)`, "pending", "REOPEN sets status = pending");
  await claims(VA);
  await expRows(`update public.task_assignments set status='approved', rating=5 where id='${a3}'`, 0, "VOLUNTEER reviews others' assignment = BLOCKED (0 rows)");
  await expRows(`update public.task_assignments set status='rejected' where id='${a4}'`, 0, "LEADER reviews other team's assignment = BLOCKED (0 rows)");
  await expRows(`delete from public.task_assignments where id='${a3}'`, 0, "VOLUNTEER deletes others' assignment = BLOCKED (0 rows)");
});

// ============================================================
// FOCUSED SCENARIO — CONVOY LIFECYCLE (0001/0006)
// ============================================================

await scenario("CONVOY LIFECYCLE", async () => {
  const ta = (await exec(`insert into public.teams (name) values ('CVA-${Date.now()}') returning id`)).rows[0].id;
  await exec(`insert into public.team_leaders (team_id, leader_id) values ('${ta}','${X}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${ta}','${VA}'),('${ta}','${X}')`);
  return { ta };
}, async ({ ta }) => {
  const mk = (name, status, days) =>
    exec(`insert into public.convoys (name, type, start_date, end_date, status, created_by) values ('${name}','normal',current_date,current_date,'${status}','${G}') returning id`)
      .then((r) => r.rows[0].id);
  let c1;
  let c2;
  await claims(G);
  c1 = await mk("c1", "upcoming", 0);
  await expRows(`insert into public.convoys (name, type, start_date, end_date, created_by) values ('c1b','normal',current_date,current_date,'${G}')`, 1, "GENERAL_ADMIN creates convoy = PASS");
  await claims(VA);
  await expErr(`insert into public.convoys (name, type, start_date, end_date, created_by) values ('cV','normal',current_date,current_date,'${VA}')`, "row-level security", "VOLUNTEER creates convoy = BLOCKED (RLS)");
  await claims(G);
  await expRows(`update public.convoys set status='active' where id='${c1}'`, 1, "GENERAL_ADMIN starts convoy = PASS");
  await claims(X);
  await expRows(`insert into public.convoy_attendance (convoy_id, volunteer_id, team_id, status, marked_by) values ('${c1}','${VA}','${ta}','present','${X}')`, 1, "LEADER marks attendance on active convoy = PASS");
  await claims(VA);
  await expErr(`insert into public.convoy_attendance (convoy_id, volunteer_id, team_id, status, marked_by) values ('${c1}','${VA}','${ta}','present','${VA}')`, "row-level security", "VOLUNTEER marks own attendance = BLOCKED (RLS)");
  await claims(X);
  await expRows(`update public.convoy_attendance set status='absent' where convoy_id='${c1}' and volunteer_id='${VA}' and team_id='${ta}'`, 1, "LEADER updates attendance = PASS");
  await expRows(`delete from public.convoy_attendance where convoy_id='${c1}' and volunteer_id='${VA}' and team_id='${ta}'`, 1, "LEADER deletes attendance = PASS");
  await expRows(`insert into public.convoy_attendance (convoy_id, volunteer_id, team_id, status, marked_by) values ('${c1}','${VA}','${ta}','present','${X}')`, 1, "LEADER marks VA present (for eval) = PASS");
  await expRows(`insert into public.convoy_evaluations (convoy_id, volunteer_id, team_id, leader_id, rating, comment) values ('${c1}','${VA}','${ta}','${X}',5,'good')`, 1, "LEADER evaluates present volunteer = PASS");
  await claims(G);
  c2 = await mk("c2", "active", 0);
  await claims(X);
  await expErr(`insert into public.convoy_evaluations (convoy_id, volunteer_id, team_id, leader_id, rating, comment) values ('${c2}','${VA}','${ta}','${X}',4,null)`, "must be marked present", "LEADER evaluates not-present volunteer = BLOCKED");
  await claims(G);
  await expRows(`update public.convoys set status='completed' where id='${c1}'`, 1, "GENERAL_ADMIN completes convoy = PASS");
  await claims(X);
  await expErr(`insert into public.convoy_attendance (convoy_id, volunteer_id, team_id, status, marked_by) values ('${c1}','${VA}','${ta}','present','${X}')`, "row-level security", "LEADER attendance on completed convoy = BLOCKED (RLS)");
  await expErr(`insert into public.convoy_evaluations (convoy_id, volunteer_id, team_id, leader_id, rating, comment) values ('${c1}','${VA}','${ta}','${X}',3,null)`, "row-level security", "LEADER evaluation on completed convoy = BLOCKED (RLS)");
  await expRows(`update public.convoy_attendance set status='present' where convoy_id='${c1}' and volunteer_id='${VA}' and team_id='${ta}'`, 0, "LEADER updates attendance on completed convoy = BLOCKED (0 rows)");
  await expRows(`insert into public.convoy_attendance (convoy_id, volunteer_id, team_id, status, marked_by) values ('${c2}','${VA}','${ta}','present','${X}')`, 1, "LEADER marks VA present on active convoy (for eval) = PASS");
  await claims(VA);
  await expErr(`insert into public.convoy_evaluations (convoy_id, volunteer_id, team_id, leader_id, rating, comment) values ('${c2}','${VA}','${ta}','${VA}',2,null)`, "row-level security", "VOLUNTEER evaluates on active convoy = BLOCKED (RLS)");
  await claims(G);
  await expRows(`update public.convoys set status='cancelled' where id='${c2}'`, 1, "GENERAL_ADMIN cancels convoy = PASS");
  await claims(X);
  await expErr(`insert into public.convoy_attendance (convoy_id, volunteer_id, team_id, status, marked_by) values ('${c2}','${VA}','${ta}','present','${X}')`, "row-level security", "LEADER attendance on cancelled convoy = BLOCKED (RLS)");
  await expRows(`update public.convoys set status='completed' where id='${c2}'`, 0, "LEADER changes convoy status = BLOCKED (0 rows)");
});

// ============================================================
// FOCUSED SCENARIO — READ VISIBILITY (0008/0010/0006)
// ============================================================

await scenario("READ VISIBILITY", async () => {
  const ta = (await exec(`insert into public.teams (name) values ('RVA-${Date.now()}') returning id`)).rows[0].id;
  const tb = (await exec(`insert into public.teams (name) values ('RVB-${Date.now()}') returning id`)).rows[0].id;
  await exec(`insert into public.team_leaders (team_id, leader_id) values ('${ta}','${X}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${ta}','${VA}'),('${ta}','${X}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${tb}','${VB}')`);
  const t1 = (await exec(`insert into public.tasks (title, team_id, created_by) values ('rvT1','${ta}','${X}') returning id`)).rows[0].id;
  const t2 = (await exec(`insert into public.tasks (title, team_id, created_by) values ('rvT2','${tb}','${VB}') returning id`)).rows[0].id;
  const a1 = (await exec(`insert into public.task_assignments (task_id, volunteer_id) values ('${t1}','${VA}') returning id`)).rows[0].id;
  await exec(`update public.profiles set status='banned' where id='${LB}'`);
  await exec(`insert into public.app_settings (key, value) values ('leaderboard_visible_to_all','false') on conflict (key) do update set value=excluded.value`);
  const cc = (await exec(`insert into public.convoys (name, type, start_date, end_date, status, created_by) values ('rvC','normal',current_date,current_date,'upcoming','${G}') returning id`)).rows[0].id;
  await exec(`update public.convoys set status='active' where id='${cc}'`);
  await exec(`insert into public.convoy_attendance (convoy_id, volunteer_id, team_id, status, marked_by) values ('${cc}','${VA}','${ta}','present','${X}'),('${cc}','${X}','${ta}','present','${X}')`);
  await exec(`update public.convoys set status='completed' where id='${cc}'`);
  return { ta, tb, t1, t2, a1, cc };
}, async ({ ta, tb, t1, t2, a1, cc }) => {
  await claims(LB);
  await expRows(`select 1 from public.tasks where id='${t1}' limit 1`, 0, "BANNED reads tasks = BLOCKED (0 rows)");
  await expRows(`select 1 from public.task_assignments where id='${a1}' limit 1`, 0, "BANNED reads task_assignments = BLOCKED (0 rows)");
  await expRows(`select 1 from public.convoys where id='${cc}' limit 1`, 1, "BANNED reads convoys = PASS (unfiltered by design)");
  await claims(VA);
  await expRows(`select 1 from public.tasks where id='${t1}' limit 1`, 1, "MEMBER reads own team task = PASS");
  await expRows(`select 1 from public.task_assignments where id='${a1}' limit 1`, 1, "ASSIGNEE reads own assignment = PASS");
  await expRows(`select 1 from public.task_assignments where task_id='${t2}' limit 1`, 0, "MEMBER reads other team's assignment = BLOCKED (0 rows)");
  await claims(VB);
  await expRows(`select 1 from public.tasks where id='${t1}' limit 1`, 0, "OTHER-TEAM member reads task = BLOCKED (0 rows)");
  await claims(X);
  await expRows(`select 1 from public.tasks where id='${t1}' limit 1`, 1, "LEADER reads own team task = PASS");
  await expRows(`select 1 from public.task_assignments where task_id='${t1}' limit 1`, 1, "LEADER reads own team's assignments = PASS");
  await claims(G);
  await expRows(`select 1 from public.tasks where id='${t1}' limit 1`, 1, "GENERAL_ADMIN reads any task = PASS");
  await claims(VA);
  await expNull(`select attendance_percent from public.get_team_leaderboard('${ta}') where volunteer_id='${VA}'`, "MEMBER detail masked (setting OFF) = PASS");
  await expEq(`select overall_score is not null from public.get_team_leaderboard('${ta}') where volunteer_id='${VA}'`, "true", "MEMBER sees overall score = PASS");
  await claims(X);
  await expNum(`select attendance_percent from public.get_team_leaderboard('${ta}') where volunteer_id='${VA}'`, 100, "LEADER sees member detail = PASS");
  await claims(G);
  await expNum(`select attendance_percent from public.get_team_leaderboard('${ta}') where volunteer_id='${VA}'`, 100, "GENERAL_ADMIN sees member detail = PASS");
  await client.query("reset role");
  await run(`insert into public.app_settings (key, value) values ('leaderboard_visible_to_all','true') on conflict (key) do update set value=excluded.value`);
  await client.query("set role authenticated");
  await claims(VA);
  await expNum(`select attendance_percent from public.get_team_leaderboard('${ta}') where volunteer_id='${VA}'`, 100, "MEMBER detail visible (setting ON) = PASS");
  await claims(VA);
  await expRows(`select 1 from public.get_score('${VA}') limit 1`, 1, "MEMBER reads own score = PASS");
  await claims(VB);
  await expRows(`select 1 from public.get_score('${VA}') limit 1`, 0, "OTHER-TEAM member reads score = BLOCKED (0 rows)");
  await claims(X);
  await expRows(`select 1 from public.get_score('${VA}') limit 1`, 1, "LEADER reads member score = PASS");
  await claims(LB);
  await expRows(`select 1 from public.get_score('${VA}') limit 1`, 0, "BANNED reads score = BLOCKED (0 rows)");
  await claims(VA);
  await expRows(`select * from public.get_profiles(array['${VA}','${X}','${VB}','${G}']::uuid[]) where id='${X}'`, 1, "MEMBER get_profiles sees shared-team peer = PASS");
  await expRows(`select * from public.get_profiles(array['${VA}','${X}','${VB}','${G}']::uuid[]) where id='${G}'`, 0, "MEMBER get_profiles hides unrelated admin = BLOCKED (0 rows)");
  await claims(G);
  await expRows(`select * from public.get_profiles(array['${VA}','${X}','${VB}','${G}']::uuid[])`, 4, "GENERAL_ADMIN get_profiles = all = PASS");
  await claims(VA);
  await expRows(`select 1 from public.get_active_profiles() where id='${X}' limit 1`, 1, "MEMBER get_active_profiles sees shared-team peer = PASS");
  await expRows(`select 1 from public.get_active_profiles() where id='${G}' limit 1`, 0, "MEMBER get_active_profiles hides unrelated admin = BLOCKED (0 rows)");
  await expRows(`select 1 from public.get_all_scores() limit 1`, 0, "MEMBER get_all_scores = BLOCKED (0 rows)");
  await claims(G);
  await expRows(`select 1 from public.get_all_scores() limit 1`, 1, "GENERAL_ADMIN get_all_scores = PASS");
});

// ============================================================
// FOCUSED SCENARIO — SCORING (0001/0003)
// ============================================================

await scenario("SCORING", async () => {
  const ta = (await exec(`insert into public.teams (name) values ('SCA-${Date.now()}') returning id`)).rows[0].id;
  const tb = (await exec(`insert into public.teams (name) values ('SCB-${Date.now()}') returning id`)).rows[0].id;
  await exec(`insert into public.team_leaders (team_id, leader_id) values ('${ta}','${X}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${ta}','${VA}'),('${ta}','${X}')`);
  await exec(`insert into public.team_members (team_id, volunteer_id) values ('${tb}','${VB}')`);
  await exec(`update public.profiles set join_date = current_date - interval '2 years' where id='${X}'`);
  const c1 = (await exec(`insert into public.convoys (name, type, start_date, end_date, status, created_by) values ('scC1','normal',current_date,current_date,'upcoming','${G}') returning id`)).rows[0].id;
  const c2 = (await exec(`insert into public.convoys (name, type, start_date, end_date, status, created_by) values ('scC2','normal',current_date,current_date,'upcoming','${G}') returning id`)).rows[0].id;
  await exec(`update public.convoys set status='active' where id in ('${c1}','${c2}')`);
  await exec(`insert into public.convoy_attendance (convoy_id, volunteer_id, team_id, status, marked_by) values ('${c1}','${X}','${ta}','present','${X}'),('${c2}','${X}','${ta}','present','${X}')`);
  await exec(`update public.convoys set status='completed' where id in ('${c1}','${c2}')`);
  await exec(`insert into public.convoy_evaluations (convoy_id, volunteer_id, team_id, leader_id, rating, comment) values ('${c1}','${X}','${ta}','${X}',3,null)`);
  const t1 = (await exec(`insert into public.tasks (title, team_id, created_by) values ('scT1','${ta}','${X}') returning id`)).rows[0].id;
  await exec(`insert into public.task_assignments (task_id, volunteer_id, status, rating, reviewed_by) values ('${t1}','${X}','approved',4,'${G}')`);
  return { ta, tb, sx: X };
}, async ({ ta, tb }) => {
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
  await expRows(`select 1 from public.get_score('${X}') limit 1`, 0, "OTHER-TEAM member reads score = BLOCKED (0 rows)");
});

console.log(`\n==== SUMMARY: ${pass} passed, ${fail} failed ====`);
await client.end();
process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
