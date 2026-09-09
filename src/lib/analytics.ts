import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/actions/settings";
import { warningAtRiskThreshold } from "@/lib/warnings";

export async function getAdminOverview() {
  const supabase = await createClient();

  const [settings, profiles, convoys, scores, warnings, awards] = await Promise.all([
    getSettings(),
    supabase.from("profiles").select("status"),
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
