import Link from "next/link";
import { Trophy, ShieldAlert, CalendarClock, Activity, UserRound, ClipboardCheck, Percent } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/actions/settings";
import { getScore, getMyTeams, getTeamLeaderboard, rankInBoard } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ProfileEdit } from "@/components/profile/profile-edit";
import { formatDate } from "@/lib/utils";
import { roleLabels, accountStatusLabels } from "@/lib/i18n";

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [score, teams, { data: warnings }] = await Promise.all([
    getScore(user.id),
    getMyTeams(user.id),
    supabase.from("warnings").select("id, number, reason, created_at").eq("volunteer_id", user.id).order("number", { ascending: false }),
  ]);

  const boards = await Promise.all(teams.map((t) => getTeamLeaderboard(t.id)));
  const ranks = teams.map((t, i) => ({ team: t, rank: rankInBoard(boards[i], user.id) }));
  const bestRank = ranks.reduce<{ rank: number; teamName: string } | null>(
    (best, r) => (r.rank !== null && (!best || r.rank < best.rank) ? { rank: r.rank, teamName: r.team.name } : best),
    null,
  );

  const warningsList = warnings ?? [];
  const settings = await getSettings();
  const p = user.profile;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header card */}
      <Card className="mb-6 overflow-hidden">
        <div className="h-24 bg-gradient-to-l from-brand-700 to-brand-900" />
        <CardContent className="-mt-12 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="rounded-2xl ring-4 ring-white">
                <Avatar name={p.full_name} src={p.avatar_url} size="xl" />
              </div>
              <div className="pb-1">
                <h2 className="text-lg font-extrabold text-slate-900">{p.full_name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone={p.role === "super_admin" ? "gold" : p.role === "general_admin" ? "teal" : "blue"}>
                    {roleLabels[p.role]}
                  </Badge>
                  <Badge tone={p.status === "active" ? "green" : "red"}>{accountStatusLabels[p.status]}</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-400" dir="ltr">
                  {p.email}
                </p>
              </div>
            </div>
            <ProfileEdit profile={p} />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Trophy} label="النقاط الإجمالية" value={score?.overall_score ?? 0} tone="gold" />
        <StatCard
          icon={Activity}
          label="أفضل ترتيب"
          value={bestRank ? `#${bestRank.rank}` : "—"}
          hint={bestRank?.teamName}
          tone="teal"
        />
        <StatCard icon={Percent} label="نسبة الحضور" value={score ? `${score.attendance_percent}%` : "—"} tone="blue" />
        <StatCard icon={ShieldAlert} label="الإنذارات" value={warningsList.length} hint={`${warningsList.length}/${settings.warning_limit}`} tone={warningsList.length >= settings.warning_limit ? "red" : "slate"} />
      </div>

      {/* Teams + rank */}
      <Card className="mb-6">
        <CardContent>
          <div className="mb-3 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-brand-700" />
            <h3 className="text-sm font-bold text-slate-800">المجموعات المنتمي لها وترتيبي</h3>
          </div>
          {teams.length === 0 ? (
            <p className="text-sm text-slate-400">أنت لست عضواً في أي مجموعة بعد.</p>
          ) : (
            <div className="space-y-3">
              {teams.map((t) => {
                const r = ranks.find((x) => x.team.id === t.id);
                return (
                  <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                      <Link href={`/teams/${t.id}`} className="text-sm font-bold text-slate-800 hover:text-brand-700">
                        {t.name}
                      </Link>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-slate-500">انضم {formatDate(t.joined_at)}</span>
                      <Badge tone={r?.rank && r.rank <= 3 ? "gold" : "slate"}>
                        {r?.rank ? `الترتيب #${r.rank}` : "لا يوجد ترتيب"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score breakdown */}
      {score && (
        <Card className="mb-6">
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-brand-700" />
              <h3 className="text-sm font-bold text-slate-800">تفاصيل النقاط</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "الحضور", value: `${score.attendance_percent}%`, score: score.attendance_score, max: 30 },
                { label: "المهام المقبولة", value: `${score.task_percent}%`, score: score.task_score, max: 30 },
                { label: "تقييمات القوافل", value: `${score.convoy_percent}%`, score: score.convoy_score, max: 30 },
                { label: "الأقدمية", value: formatDate(p.join_date), score: score.seniority_score, max: 10 },
              ].map((row) => (
                <div key={row.label} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">{row.label}</span>
                    <span className="text-slate-400">{row.value}</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${Math.min(100, (row.score / row.max) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">{row.score} من {row.max} نقطة</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {warningsList.length > 0 && (
        <Card>
          <CardContent>
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              <h3 className="text-sm font-bold text-slate-800">سجل الإنذارات</h3>
            </div>
            <div className="space-y-3">
              {warningsList.map((w) => (
                <div key={w.id} className="rounded-xl border border-red-100 bg-red-50/40 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <Badge tone="red">إنذار رقم {w.number}</Badge>
                    <span className="text-xs text-slate-400">{formatDate(w.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{w.reason}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {p.join_date && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <CalendarClock className="h-3.5 w-3.5" />
          تاريخ الانضمام: {formatDate(p.join_date)}
        </p>
      )}
    </div>
  );
}
