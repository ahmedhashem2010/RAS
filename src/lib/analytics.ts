import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/actions/settings";
import { warningAtRiskThreshold } from "@/lib/warnings";

export interface TeamActivity {
  team_id: string;
  name: string;
  color: string;
  eval_mode: string;
  member_count: number;
  attendance_rate: number | null;
  task_completion: number | null;
  avg_performance: number | null; // 1-5
  convoy_count: number;
  avg_score: number | null;
  activity_score: number; // 0-100 weighted, transparent formula
}

const weight = { attendance: 0.4, tasks: 0.3, performance: 0.2, score: 0.1 };

export async function getTeamActivity(): Promise<TeamActivity[]> {
  const supabase = await createClient();

  const [teamsRes, membersRes, attendanceRes, tasksRes, evalsRes, scoresRes] =
    await Promise.all([
      supabase.from("teams").select("id, name, color, eval_mode"),
      supabase.from("team_members").select("team_id"),
      supabase
        .from("convoy_attendance")
        .select("team_id, status, convoy_id, convoys(status)")
        .in("convoys.status", ["completed"]),
      supabase
        .from("task_assignments")
        .select("status, tasks(team_id)"),
      supabase
        .from("convoy_evaluations")
        .select("team_id, rating"),
      supabase.rpc("get_leaderboard"),
    ]);

  const teams = teamsRes.data ?? [];
  const memberCount = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    memberCount.set(m.team_id, (memberCount.get(m.team_id) ?? 0) + 1);
  }

  const attendanceByTeam = new Map<
    string,
    { points: number; count: number; convoys: Set<string> }
  >();
  for (const a of attendanceRes.data ?? []) {
    const t = a.convoy_id;
    const entry = attendanceByTeam.get(a.team_id) ?? {
      points: 0,
      count: 0,
      convoys: new Set<string>(),
    };
    entry.count += 1;
    entry.convoys.add(t);
    entry.points += a.status === "present" ? 1 : a.status === "excused" ? 0.5 : 0;
    attendanceByTeam.set(a.team_id, entry);
  }

  const tasksByTeam = new Map<string, { approved: number; total: number }>();
  for (const ta of tasksRes.data ?? []) {
    const teamId = (ta.tasks as unknown as { team_id: string } | null)?.team_id;
    if (!teamId) continue;
    const entry = tasksByTeam.get(teamId) ?? { approved: 0, total: 0 };
    entry.total += 1;
    if (ta.status === "approved") entry.approved += 1;
    tasksByTeam.set(teamId, entry);
  }

  const evalByTeam = new Map<string, { sum: number; count: number }>();
  for (const e of evalsRes.data ?? []) {
    const entry = evalByTeam.get(e.team_id) ?? { sum: 0, count: 0 };
    entry.sum += e.rating;
    entry.count += 1;
    evalByTeam.set(e.team_id, entry);
  }

  const scoreByTeam = new Map<string, { sum: number; count: number }>();
  for (const s of scoresRes.data ?? []) {
    if (s.status !== "active") continue;
    const entry = scoreByTeam.get(s.team_id) ?? { sum: 0, count: 0 };
    entry.sum += s.overall_score ?? 0;
    entry.count += 1;
    scoreByTeam.set(s.team_id, entry);
  }

  const result: TeamActivity[] = teams.map((team) => {
    const att = attendanceByTeam.get(team.id);
    const attendanceRate =
      att && att.count > 0 ? (att.points / att.count) * 100 : null;
    const tasks = tasksByTeam.get(team.id);
    const taskCompletion =
      tasks && tasks.total > 0 ? (tasks.approved / tasks.total) * 100 : null;
    const ev = evalByTeam.get(team.id);
    const avgPerformance = ev && ev.count > 0 ? ev.sum / ev.count : null;
    const sc = scoreByTeam.get(team.id);
    const avgScore = sc && sc.count > 0 ? sc.sum / sc.count : null;

    const attendancePart = (attendanceRate ?? 0) * weight.attendance;
    const taskPart = (taskCompletion ?? 0) * weight.tasks;
    const perfPart = (avgPerformance ?? 0) * 20 * weight.performance;
    const scorePart = (avgScore ?? 0) * weight.score;
    const activityScore = Math.round(attendancePart + taskPart + perfPart + scorePart);

    return {
      team_id: team.id,
      name: team.name,
      color: team.color,
      eval_mode: team.eval_mode,
      member_count: memberCount.get(team.id) ?? 0,
      attendance_rate: attendanceRate === null ? null : Math.round(attendanceRate * 10) / 10,
      task_completion: taskCompletion === null ? null : Math.round(taskCompletion * 10) / 10,
      avg_performance: avgPerformance === null ? null : Math.round(avgPerformance * 100) / 100,
      convoy_count: att?.convoys.size ?? 0,
      avg_score: avgScore === null ? null : Math.round(avgScore * 10) / 10,
      activity_score: activityScore,
    };
  });

  return result.sort((a, b) => b.activity_score - a.activity_score);
}

export async function getAdminOverview() {
  const supabase = await createClient();
  const settings = await getSettings();

  const [profiles, teams, convoys, scores, warnings, awards] = await Promise.all([
    supabase.from("profiles").select("status"),
    supabase.from("teams").select("id"),
    supabase
      .from("convoys")
      .select("*")
      .order("start_date", { ascending: true }),
    supabase.rpc("get_all_scores"),
    supabase
      .from("warnings")
      .select("id, number, volunteer_id, profiles!warnings_volunteer_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("awards").select("id", { count: "exact", head: true }),
  ]);

  const allProfiles = profiles.data ?? [];
  const active = allProfiles.filter((p) => p.status === "active").length;
  const banned = allProfiles.filter((p) => p.status === "banned").length;

  const scoreRows = (scores.data ?? []) as Array<{ overall_score: number | null }>;
  const avgScore =
    scoreRows.length > 0
      ? Math.round((scoreRows.reduce((s, r) => s + (r.overall_score ?? 0), 0) / scoreRows.length) * 10) / 10
      : 0;

  const now = new Date().toISOString().slice(0, 10);
  const convoysAll = convoys.data ?? [];
  const upcoming = convoysAll
    .filter((c) => c.status === "upcoming" && c.start_date >= now)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const activeConvoys = convoysAll.filter((c) => c.status === "active");
  const recentConvoy = convoysAll
    .filter((c) => c.status === "completed")
    .sort((a, b) => b.end_date.localeCompare(a.end_date))[0];

  // Warning alerts: volunteers at or above the at-risk threshold (warning_limit - 1)
  const warningMap = new Map<string, { count: number; full_name: string }>();
  for (const w of warnings.data ?? []) {
    const entry = warningMap.get(w.volunteer_id) ?? {
      count: 0,
      full_name: (w.profiles as unknown as { full_name: string } | null)?.full_name ?? "متطوع",
    };
    entry.count = Math.max(entry.count, w.number);
    warningMap.set(w.volunteer_id, entry);
  }
  const warningAlerts = [...warningMap.entries()]
    .map(([id, v]) => ({ volunteer_id: id, ...v }))
    .filter((v) => v.count >= warningAtRiskThreshold(settings.warning_limit))
    .sort((a, b) => b.count - a.count);

  return {
    totalVolunteers: allProfiles.length,
    activeVolunteers: active,
    bannedVolunteers: banned,
    totalTeams: teams.data?.length ?? 0,
    upcoming: upcoming[0] ?? null,
    upcomingCount: upcoming.length,
    activeConvoys,
    recentConvoy: recentConvoy ?? null,
    avgScore,
    activeWarnings: warnings.data?.filter((w) => w.number >= warningAtRiskThreshold(settings.warning_limit)).length ?? 0,
    totalAwards: awards.count ?? 0,
    warningAlerts,
    warningLimit: settings.warning_limit,
  };
}

export interface ActivityItem {
  kind: "rating" | "task" | "convoy" | "award" | "warning" | "member";
  title: string;
  detail?: string;
  at: string;
  href?: string;
}

export async function getRecentActivity(limit = 8): Promise<ActivityItem[]> {
  const supabase = await createClient();

  const [evals, awards, approved, convoys, warnings] = await Promise.all([
    supabase
      .from("convoy_evaluations")
      .select("rating, created_at, profiles!convoy_evaluations_volunteer_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("awards")
      .select("type, created_at, profiles!awards_recipient_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("task_assignments")
      .select("reviewed_at, created_at, tasks!inner(title), profiles!task_assignments_volunteer_id_fkey(full_name)")
      .eq("status", "approved")
      .not("reviewed_at", "is", null)
      .order("reviewed_at", { ascending: false })
      .limit(limit),
    supabase
      .from("convoys")
      .select("name, created_at, id")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("warnings")
      .select("number, created_at, profiles!warnings_volunteer_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const items: ActivityItem[] = [];

  for (const e of evals.data ?? []) {
    const name = (e.profiles as unknown as { full_name: string } | null)?.full_name ?? "متطوع";
    items.push({
      kind: "rating",
      title: `${name} حصل على ${e.rating}/5`,
      detail: "تقييم أداء في قافلة",
      at: e.created_at,
    });
  }
  for (const a of awards.data ?? []) {
    const name = (a.profiles as unknown as { full_name: string } | null)?.full_name ?? "متطوع";
    const label = a.type === "best_leader" ? "أفضل قائد" : "المتطوع المثالي";
    items.push({
      kind: "award",
      title: `${name} حصل على جائزة ${label}`,
      at: a.created_at,
      href: "/awards",
    });
  }
  for (const t of approved.data ?? []) {
    const name = (t.profiles as unknown as { full_name: string } | null)?.full_name ?? "متطوع";
    const taskTitle = (t.tasks as unknown as { title: string } | null)?.title ?? "مهمة";
    items.push({
      kind: "task",
      title: `${name} أكمل مهمة: ${taskTitle}`,
      at: t.reviewed_at ?? t.created_at ?? "",
      href: "/tasks",
    });
  }
  for (const c of convoys.data ?? []) {
    items.push({
      kind: "convoy",
      title: `قافلة جديدة: ${c.name}`,
      at: c.created_at,
      href: `/convoys/${c.id}`,
    });
  }
  for (const w of warnings.data ?? []) {
    const name = (w.profiles as unknown as { full_name: string } | null)?.full_name ?? "متطوع";
    items.push({
      kind: "warning",
      title: `إنذار رقم ${w.number} لـ ${name}`,
      at: w.created_at,
      href: "/warnings",
    });
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
