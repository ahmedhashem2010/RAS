import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ScoreRing, Progress } from "@/components/ui/progress";
import { StarRating } from "@/components/ui/star-rating";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Trophy,
  ShieldAlert,
  CalendarCheck,
  ClipboardList,
} from "lucide-react";
import { getScore } from "@/lib/queries";
import { getSettings } from "@/lib/actions/settings";
import { formatDate, formatPercent } from "@/lib/utils";
import { roleLabels, awardTypeLabels, attendanceLabels, convoyTypeLabels } from "@/lib/i18n";
import { VolunteerActions } from "@/components/volunteers/volunteer-actions";

export default async function VolunteerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();
  const settings = await getSettings();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).single();
  if (!profile) notFound();

  // Access control: self, admin, or leader of one of the volunteer's teams
  if (profile.id !== user.id && !user.isAdmin) {
    const { data: teams } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("volunteer_id", id);
    const isLeaderOfMember = (teams ?? []).some((t) => user.ledTeamIds.includes(t.team_id));
    if (!isLeaderOfMember) redirect("/dashboard");
  }

  const isAdminView = user.isAdmin;
  const [score, memberships] = await Promise.all([
    getScore(id),
    supabase
      .from("team_members")
      .select("team_id, teams!inner(id, name, color, eval_mode)")
      .eq("volunteer_id", id),
  ]);

  const [attendanceRes, evalsRes, tasksRes, awardsRes, warningsRes, ledRes] =
    await Promise.all([
      supabase
        .from("convoy_attendance")
        .select("*, convoys!inner(name, type, start_date, status)")
        .eq("volunteer_id", id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("convoy_evaluations")
        .select("*, convoys!inner(name)")
        .eq("volunteer_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("task_assignments")
        .select("status, rating, tasks!inner(title)")
        .eq("volunteer_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("awards")
        .select("*")
        .eq("recipient_id", id)
        .order("award_date", { ascending: false }),
      supabase
        .from("warnings")
        .select("*, profiles!warnings_issued_by_fkey(full_name)")
        .eq("volunteer_id", id)
        .order("warning_date", { ascending: false }),
      supabase.from("team_leaders").select("team_id, teams!inner(id, name)").eq("leader_id", id),
    ]);

  const attendance = attendanceRes.data ?? [];
  const evaluations = evalsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const awards = awardsRes.data ?? [];
  const warnings = warningsRes.data ?? [];
  const ledTeams = (ledRes.data ?? []).map((l) => l.teams) as unknown as Array<{ id: string; name: string }>;

  const pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length;
  const submittedTasks = tasks.filter((t) => t.status === "submitted").length;
  const approvedTasks = tasks.filter((t) => t.status === "approved").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:p-6">
        <Avatar name={profile.full_name} src={profile.avatar_url} size="xl" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
              {profile.full_name}
            </h1>
            {profile.role !== "volunteer" && (
              <Badge tone="gold">{roleLabels[profile.role]}</Badge>
            )}
            <StatusBadge status={profile.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(memberships.data ?? []).map((m) => (
              <Badge key={m.team_id} tone="teal">
                {(m.teams as unknown as { name: string }).name}
              </Badge>
            ))}
            {ledTeams.length > 0 && (
              <Badge tone="blue">
                قائد: {ledTeams.map((t) => t.name).join("، ")}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {profile.age ? `العمر: ${profile.age} سنة · ` : ""}
            انضم {formatDate(profile.join_date)}
            {profile.phone ? ` · ${profile.phone}` : ""}
          </p>
        </div>
        {isAdminView && <VolunteerActions profile={profile} warningLimit={settings.warning_limit} />}
      </div>

      {/* Warning alert */}
      {warnings.length >= settings.warning_limit && isAdminView && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm font-bold text-red-800">
            وصل المتطوع إلى {settings.warning_limit} إنذارات — يمكنك مراجعة الحالة أو حظر الحساب.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          {/* Score */}
          <Card>
            <CardHeader>
              <CardTitle>النتيجة الإجمالية</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <ScoreRing value={score?.overall_score ?? 0} size={140} />
              <div className="w-full space-y-2.5">
                {[
                  { label: "الحضور (30%)", pct: score?.attendance_percent ?? 0 },
                  { label: "أداء المهام (30%)", pct: score?.task_percent ?? 0 },
                  { label: "أداء القوافل (30%)", pct: score?.convoy_percent ?? 0 },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold text-slate-600">{row.label}</span>
                      <span className="text-slate-400">{formatPercent(row.pct)}</span>
                    </div>
                    <Progress value={row.pct} />
                  </div>
                ))}
                <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="font-semibold text-slate-600">الأقدمية (10%)</span>
                  <span className="font-bold text-slate-800">{score?.seniority_score ?? 0} من 10</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attendance summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-brand-600" />
                الحضور
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-extrabold text-slate-900">
                {score?.attendance_points ?? 0}
                <span className="text-base font-bold text-slate-400"> / {score?.attendance_opportunities ?? 0}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge tone="green">حاضر: {score?.present_count ?? 0}</Badge>
                <Badge tone="amber">معذور: {score?.excused_count ?? 0}</Badge>
                <Badge tone="red">غائب: {score?.absent_count ?? 0}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Task summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-brand-600" />
                المهام
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xl font-extrabold text-blue-600">{pendingTasks}</p>
                  <p className="text-[10px] font-semibold text-blue-700">قيد التنفيذ</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xl font-extrabold text-amber-600">{submittedTasks}</p>
                  <p className="text-[10px] font-semibold text-amber-700">بانتظار المراجعة</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3">
                  <p className="text-xl font-extrabold text-emerald-600">{approvedTasks}</p>
                  <p className="text-[10px] font-semibold text-emerald-700">مكتملة</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {/* Convoy history */}
          <Card>
            <CardHeader>
              <CardTitle>سجل القوافل</CardTitle>
            </CardHeader>
            <CardContent>
              {attendance.length === 0 ? (
                <EmptyState title="لا يوجد سجل حضور بعد" />
              ) : (
                <div className="space-y-2">
                  {attendance.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800">
                          {(a.convoys as { name: string }).name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {convoyTypeLabels[(a.convoys as { type: string }).type]} ·{" "}
                          {formatDate((a.convoys as { start_date: string }).start_date)}
                        </p>
                      </div>
                      <Badge tone={a.status === "present" ? "green" : a.status === "excused" ? "amber" : "red"}>
                        {attendanceLabels[a.status]}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Evaluations history */}
          <Card>
            <CardHeader>
              <CardTitle>تقييمات الأداء السابقة</CardTitle>
            </CardHeader>
            <CardContent>
              {evaluations.length === 0 ? (
                <EmptyState title="لا توجد تقييمات بعد" />
              ) : (
                <div className="space-y-2">
                  {evaluations.map((e) => (
                    <div key={e.id} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-800">
                          {(e.convoys as { name: string }).name}
                        </p>
                        <StarRating value={e.rating} readOnly size="sm" />
                      </div>
                      {e.comment && (
                        <p className="mt-1.5 text-sm text-slate-500">{e.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Awards */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-gold-500" />
                الجوائز
              </CardTitle>
            </CardHeader>
            <CardContent>
              {awards.length === 0 ? (
                <EmptyState title="لا توجد جوائز" />
              ) : (
                <div className="space-y-2">
                  {awards.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                      <Trophy className="h-5 w-5 text-gold-500" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800">{awardTypeLabels[a.type]}</p>
                        {a.reason && <p className="text-xs text-slate-500">{a.reason}</p>}
                      </div>
                      <span className="text-xs text-slate-400">{formatDate(a.award_date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Warnings history */}
          <Card className={warnings.length > 0 ? "border-red-100" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                سجل الإنذارات
              </CardTitle>
              {warnings.length > 0 && (
                <Badge tone={warnings.length >= settings.warning_limit ? "red" : "amber"}>
                  {warnings.length} من {settings.warning_limit}
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {warnings.length === 0 ? (
                <EmptyState title="لا توجد إنذارات" description="سجل نظيف." />
              ) : (
                <div className="space-y-3">
                  {warnings.map((w) => (
                    <div key={w.id} className="rounded-lg border border-red-100 bg-red-50/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-extrabold text-red-700">
                          إنذار رقم {w.number}
                        </p>
                        <span className="text-xs text-slate-400">{formatDate(w.warning_date)}</span>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{w.reason}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        صادر عن {(w.profiles as { full_name: string } | null)?.full_name ?? "الإدارة"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
