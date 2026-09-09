import Link from "next/link";
import {
  ClipboardList,
  Trophy,
  ShieldAlert,
  Bell,
  CalendarCheck,
  ChevronLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/actions/settings";
import { getScore, getGlobalLeaderboard, rankInBoard } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreRing, Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPercent, timeAgo } from "@/lib/utils";
import { awardTypeLabels } from "@/lib/i18n";
import type { AuthedUser } from "@/lib/auth";

export async function VolunteerDashboard({ user }: { user: AuthedUser }) {
  const supabase = await createClient();
  const [settings, score, board] = await Promise.all([
    getSettings(),
    getScore(user.id),
    getGlobalLeaderboard(),
  ]);

  const globalRank = rankInBoard(board, user.id);
  const topVolunteers = [...board]
    .filter((e) => e.status === "active")
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
    .slice(0, 5);

  const [tasksRes, awardsRes, warningsRes, notificationsRes] =
    await Promise.all([
      supabase
        .from("task_assignments")
        .select("status")
        .eq("volunteer_id", user.id),
      supabase
        .from("awards")
        .select("type, award_date, reason")
        .eq("recipient_id", user.id)
        .order("award_date", { ascending: false })
        .limit(5),
      supabase
        .from("warnings")
        .select("number, reason, warning_date")
        .eq("volunteer_id", user.id)
        .order("warning_date", { ascending: false }),
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const tasks = tasksRes.data ?? [];
  const pending = tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length;
  const submitted = tasks.filter((t) => t.status === "submitted").length;
  const approved = tasks.filter((t) => t.status === "approved").length;

  const warnings = warningsRes.data ?? [];
  const awards = awardsRes.data ?? [];
  const unread = notificationsRes.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
            أهلاً، {user.profile.full_name.split(" ")[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">هذه نظرة سريعة على أدائك</p>
        </div>
      </div>

      {warnings.length >= settings.warning_limit && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm font-bold text-red-800">
            لديك {warnings.length} إنذارات. يرجى مراجعة الإدارة بخصوص حالتك.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Score card */}
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <ScoreRing value={score?.overall_score ?? 0} size={150} />
            <div className="w-full flex-1 space-y-3">
              <p className="text-center text-sm font-bold text-slate-700 sm:text-right">
                تفاصيل النقاط — كيف تُحسب النتيجة الإجمالية؟
              </p>
              {[
                { label: "الحضور (30%)", pct: score?.attendance_percent ?? 0, sub: `${score?.attendance_points ?? 0}/${score?.attendance_opportunities ?? 0}` },
                { label: "أداء المهام (30%)", pct: score?.task_percent ?? 0, sub: `${score?.approved_tasks ?? 0} مهام مقبولة` },
                { label: "أداء القوافل (30%)", pct: score?.convoy_percent ?? 0, sub: `${score?.evaluations ?? 0} تقييمات` },
                { label: "الأقدمية (10%)", pct: ((score?.seniority_score ?? 0) / 10) * 100, sub: `${score?.seniority_score ?? 0} من 10` },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">{row.label}</span>
                    <span className="text-slate-400">
                      {row.sub} · {formatPercent(row.pct)}
                    </span>
                  </div>
                  <Progress value={row.pct} />
                </div>
              ))}
              <Link href="/profile" className="mt-1 inline-block text-xs font-semibold text-brand-700 hover:text-brand-800">
                عرض الملف الكامل
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Attendance + rank */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-brand-600" />
                حضور القوافل
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-gold-500" />
                ترتيبي العام
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-extrabold text-slate-900">
                {globalRank ? `#${globalRank}` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                من بين {board.filter((e) => e.status === "active").length} متطوع نشط في الترتيب العام
              </p>
              <Link
                href="/leaderboard"
                className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:text-brand-800"
              >
                عرض لوحة الترتيب الكاملة
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-brand-600" />
              مهامي
            </CardTitle>
            <Link href="/tasks" className="text-xs font-semibold text-brand-700 hover:text-brand-800">
              الكل
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "قيد التنفيذ", value: pending, tone: "text-blue-600" },
                { label: "بانتظار المراجعة", value: submitted, tone: "text-amber-600" },
                { label: "مكتملة", value: approved, tone: "text-emerald-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-slate-50 p-3">
                  <p className={`text-2xl font-extrabold ${s.tone}`}>{s.value}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
            {tasks.length === 0 && (
              <p className="mt-3 text-center text-xs text-slate-400">
                لا توجد مهام بعد — سيتم إشعارك عند تكليفك.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Awards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-gold-500" />
              جوائزي
            </CardTitle>
            <Link href="/awards" className="text-xs font-semibold text-brand-700 hover:text-brand-800">
              الكل
            </Link>
          </CardHeader>
          <CardContent>
            {awards.length === 0 ? (
              <EmptyState
                title="لا توجد جوائز بعد"
                description="استمر في التميز — الجوائز تُمنح بأداء متميز."
              />
            ) : (
              <div className="space-y-2">
                {awards.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/60 p-2.5">
                    <Trophy className="h-4 w-4 shrink-0 text-gold-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {awardTypeLabels[a.type]}
                      </p>
                      {a.reason && <p className="truncate text-xs text-slate-500">{a.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-brand-600" />
              الإشعارات
            </CardTitle>
            <Link href="/notifications" className="text-xs font-semibold text-brand-700 hover:text-brand-800">
              عرض الكل
            </Link>
          </CardHeader>
          <CardContent>
            {unread.length === 0 ? (
              <EmptyState title="لا توجد إشعارات جديدة" />
            ) : (
              <div className="space-y-2">
                {unread.map((n) => (
                  <div key={n.id} className="flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50/40 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800">{n.title}</p>
                      {n.body && <p className="truncate text-xs text-slate-500">{n.body}</p>}
                      <p className="mt-0.5 text-[10px] text-slate-400">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top volunteers */}
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>أفضل المتطوعين</CardTitle>
            <Link href="/leaderboard" className="flex items-center text-xs font-semibold text-brand-700 hover:text-brand-800">
              عرض الكل <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {topVolunteers.length === 0 ? (
              <EmptyState title="لا توجد بيانات ترتيب بعد" />
            ) : (
              topVolunteers.map((e, i) => (
                <div key={e.volunteer_id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <span className={`w-6 text-center text-sm font-extrabold ${i < 3 ? "text-gold-500" : "text-slate-400"}`}>
                    {i + 1}
                  </span>
                  <Avatar name={e.full_name} src={e.avatar_url} size="sm" />
                  <span className="flex-1 truncate text-sm font-semibold text-slate-800">
                    {e.full_name}
                  </span>
                  <Badge tone={i < 3 ? "gold" : "slate"}>{e.overall_score ?? 0}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
