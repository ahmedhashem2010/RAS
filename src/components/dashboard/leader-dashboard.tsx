import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Users, Plus, Truck, Star, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { taskStatusLabels, convoyTypeLabels } from "@/lib/i18n";
import type { SessionUser } from "@/lib/types";

export async function LeaderDashboard({ user }: { user: SessionUser }) {
  const supabase = await createClient();

  const teamId = user.ledTeamIds[0];
  if (!teamId) {
    return (
      <div>
        <PageHeader title="لوحة التحكم" description="إدارة فريقك بسرعة من هاتفك" />
        <EmptyState
          icon={Users}
          title="لم يتم تعيينك كقائد لأي فريق بعد"
          description="تواصل مع مدير النظام لتعيينك قائداً لفريق."
        />
      </div>
    );
  }

  const [teamRes, membersRes, scoresRes, attendanceRes, taskRes, pendingRes, convoysRes] =
    await Promise.all([
      supabase.from("teams").select("*").eq("id", teamId).single(),
      supabase
        .from("team_members")
        .select("volunteer_id, profiles(id, full_name, avatar_url, status)")
        .eq("team_id", teamId),
      supabase.rpc("get_team_leaderboard", { p_team_id: teamId }),
      supabase
        .from("convoy_attendance")
        .select("status")
        .eq("team_id", teamId),
      supabase
        .from("task_assignments")
        .select("status, tasks!inner(team_id)")
        .eq("tasks.team_id", teamId),
      supabase
        .from("task_assignments")
        .select("id, status, tasks!inner(id, title), profiles!task_assignments_volunteer_id_fkey(full_name, avatar_url)")
        .eq("tasks.team_id", teamId)
        .eq("status", "submitted")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("convoys")
        .select("*")
        .in("status", ["upcoming", "active"])
        .order("start_date", { ascending: true }),
    ]);

  const team = teamRes.data!;
  const members = (membersRes.data ?? []).map((m) => m.profiles as unknown as { id: string; full_name: string; avatar_url: string | null; status: string });
  const activeMembers = members.filter((m) => m.status === "active");
  const scoreRows = ((scoresRes.data ?? []) as Array<{ status: string; overall_score: number | null }>).filter((r) => r.status === "active");
  const avgScore = scoreRows.length
    ? Math.round((scoreRows.reduce((s, r) => s + (r.overall_score ?? 0), 0) / scoreRows.length) * 10) / 10
    : 0;

  const att = attendanceRes.data ?? [];
  const attPoints = att.reduce((s, a) => s + (a.status === "present" ? 1 : a.status === "excused" ? 0.5 : 0), 0);
  const attendanceRate = att.length ? Math.round((attPoints / att.length) * 1000) / 10 : 0;

  const tasks = taskRes.data ?? [];
  const approved = tasks.filter((t) => t.status === "approved").length;
  const taskRate = tasks.length ? Math.round((approved / tasks.length) * 1000) / 10 : 0;

  const pending = (pendingRes.data ?? []) as unknown as Array<{
    id: string;
    status: string;
    tasks: { id: string; title: string };
    profiles: { full_name: string; avatar_url: string | null };
  }>;

  const upcomingConvoy = convoysRes.data?.[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`فريق ${team.name}`}
        description="إدارة فريقك بسرعة من أي مكان"
        action={
          <Link href={`/tasks/new?team=${teamId}`}>
            <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
              <Plus className="h-4 w-4" />
              مهمة جديدة
            </span>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="المتطوعون" value={activeMembers.length} tone="teal" />
        <StatCard icon={Star} label="متوسط النقاط" value={avgScore} tone="gold" hint="من 100" />
        <StatCard icon={CheckCircle2} label="نسبة إتمام المهام" value={`${taskRate}%`} tone="blue" />
        <StatCard icon={Clock} label="نسبة الحضور" value={`${attendanceRate}%`} tone="slate" />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: `/tasks/new?team=${teamId}`, label: "إنشاء مهمة", icon: Plus, tone: "bg-brand-700 text-white" },
          { href: `/teams/${teamId}`, label: "أعضاء الفريق", icon: Users, tone: "bg-blue-600 text-white" },
          { href: `/leaderboard?team=${teamId}`, label: "لوحة الترتيب", icon: Star, tone: "bg-amber-500 text-white" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${a.tone}`}>
              <a.icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold text-slate-700">{a.label}</span>
          </Link>
        ))}
        {upcomingConvoy ? (
          <Link
            href={`/convoys/${upcomingConvoy.id}`}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Truck className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold text-slate-700">حضور القافلة</span>
          </Link>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
            <Truck className="h-5 w-5 text-slate-300" />
            <span className="text-xs text-slate-400">لا قافلة قادمة</span>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending approvals */}
        <Card>
          <CardHeader>
            <CardTitle>مهام بانتظار المراجعة</CardTitle>
            <Badge tone="amber">{pending.length}</Badge>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <EmptyState
                title="لا توجد مهام بانتظار المراجعة"
                description="كل المهام تمت مراجعتها."
              />
            ) : (
              <div className="space-y-3">
                {pending.map((p) => (
                  <Link
                    key={p.id}
                    href={`/tasks/${p.tasks.id}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                  >
                    <Avatar name={p.profiles.full_name} src={p.profiles.avatar_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {p.profiles.full_name}
                      </p>
                      <p className="truncate text-xs text-slate-500">{p.tasks.title}</p>
                    </div>
                    <Badge tone="amber">{taskStatusLabels.submitted}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming convoy */}
        <Card>
          <CardHeader>
            <CardTitle>القافلة القادمة</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingConvoy ? (
              <div>
                <Link href={`/convoys/${upcomingConvoy.id}`} className="group">
                  <p className="text-base font-extrabold text-slate-900 group-hover:text-brand-700">
                    {upcomingConvoy.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone="teal">{convoyTypeLabels[upcomingConvoy.type]}</Badge>
                    <StatusBadge status={upcomingConvoy.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {formatDate(upcomingConvoy.start_date)} — {formatDate(upcomingConvoy.end_date)}
                  </p>
                  {upcomingConvoy.location && (
                    <p className="mt-1 text-sm text-slate-500">{upcomingConvoy.location}</p>
                  )}
                </Link>
                <div className="mt-4 flex gap-2">
                  <Link href={`/convoys/${upcomingConvoy.id}/attendance?team=${teamId}`}>
                    <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
                      <Truck className="h-4 w-4" />
                      تسجيل الحضور
                    </span>
                  </Link>
                  <Link href={`/convoys/${upcomingConvoy.id}/evaluate?team=${teamId}`}>
                    <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      تقييم الأداء
                    </span>
                  </Link>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Truck}
                title="لا توجد قوافل قادمة"
                description="ستظهر القوافل هنا فور إنشائها من قبل الإدارة."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
