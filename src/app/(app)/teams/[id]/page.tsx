import { notFound } from "next/navigation";
import {
  ArrowRight,
  Users,
  Star,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getTeamActivity } from "@/lib/analytics";
import { getTeamLeaderboard } from "@/lib/queries";
import { Progress } from "@/components/ui/progress";
import { evalModeLabels } from "@/lib/i18n";
import { TeamManagePanel } from "@/components/teams/team-manage-panel";
import { LeaveTeamButton } from "@/components/teams/leave-team-button";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: team } = await supabase.from("teams").select("*").eq("id", id).single();
  if (!team) notFound();

  const [activity, leadersRes, membersRes] = await Promise.all([
    getTeamActivity(),
    supabase
      .from("team_leaders")
      .select("leader_id, profiles!inner(id, full_name, avatar_url, role)")
      .eq("team_id", id),
    supabase
      .from("team_members")
      .select("volunteer_id, joined_at, profiles!inner(id, full_name, avatar_url, status, role)")
      .eq("team_id", id),
  ]);

  const teamStat = activity.find((a) => a.team_id === id) ?? null;
  const leaders = (leadersRes.data ?? []).map((l) => l.profiles) as unknown as Array<{
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
  }>;
  const members = (membersRes.data ?? []).map((m) => ({
    ...(m.profiles as unknown as { id: string; full_name: string; avatar_url: string | null; status: string; role: string }),
    joined_at: m.joined_at,
  }));

  const board = await getTeamLeaderboard(id);
  const ranked = [...board]
    .filter((b) => b.status === "active")
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));

  const canManage = user.isAdmin || user.ledTeamIds.includes(id);
  const isMember = members.some((m) => m.id === user.id);
  const activeMembers = members.filter((m) => m.status === "active");

  return (
    <div>
      <PageHeader
        title={team.name}
        description={`${evalModeLabels[team.eval_mode]} · ${team.description ?? ""}`}
        action={
          <Link href="/teams" className="inline-flex h-10 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowRight className="h-4 w-4" />
            كل الفرق
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          {/* Team stat */}
          {teamStat && (
            <Card>
              <CardHeader>
                <CardTitle>نشاط الفريق</CardTitle>
                <Badge tone="teal">{teamStat.activity_score}%</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>نسبة الحضور</span>
                    <span>{teamStat.attendance_rate ?? 0}%</span>
                  </div>
                  <Progress value={teamStat.attendance_rate ?? 0} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>إتمام المهام</span>
                    <span>{teamStat.task_completion ?? 0}%</span>
                  </div>
                  <Progress value={teamStat.task_completion ?? 0} color="#2563eb" />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-slate-500">
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-base font-extrabold text-slate-800">{activeMembers.length}</p>
                    متطوع نشط
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-base font-extrabold text-slate-800">{teamStat.convoy_count}</p>
                    قافلة
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-base font-extrabold text-slate-800">{teamStat.avg_score ?? 0}</p>
                    متوسط النقاط
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-base font-extrabold text-slate-800">{teamStat.avg_performance ?? 0}</p>
                    متوسط الأداء
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Leaders */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-brand-600" />
                قادة الفريق
              </CardTitle>
              {canManage && <TeamManagePanel teamId={id} mode="leader" />}
            </CardHeader>
            <CardContent className="space-y-3">
              {leaders.length === 0 ? (
                <p className="text-sm text-slate-400">لا يوجد قادة بعد.</p>
              ) : (
                leaders.map((l) => (
                  <div key={l.id} className="flex items-center gap-3">
                    <Avatar name={l.full_name} src={l.avatar_url} size="sm" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">{l.full_name}</p>
                      {l.role !== "volunteer" && (
                        <Badge tone="gold" className="text-[10px]">
                          {l.role === "super_admin" ? "مدير النظام" : "مدير عام"}
                        </Badge>
                      )}
                    </div>
                    {canManage && <TeamManagePanel teamId={id} mode="leader-remove" leaderId={l.id} name={l.full_name} />}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {/* Members */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-600" />
                الأعضاء
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge tone="slate">{activeMembers.length}</Badge>
                {isMember && !canManage && <LeaveTeamButton teamId={id} />}
                {canManage && <TeamManagePanel teamId={id} mode="member" />}
              </div>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <EmptyState
                  title="لا يوجد أعضاء بعد"
                  description="أضف متطوعين إلى الفريق."
                />
              ) : (
                <div className="divide-y divide-slate-50">
                  {members.map((m) => {
                    const score = board.find((b) => b.volunteer_id === m.id)?.overall_score ?? null;
                    return (
                      <div key={m.id} className="flex items-center gap-3 py-2.5">
                        <Avatar name={m.full_name} src={m.avatar_url} />
                        <div className="min-w-0 flex-1">
                          <Link href={`/volunteers/${m.id}`} className="truncate text-sm font-bold text-slate-800 hover:text-brand-700">
                            {m.full_name}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <StatusBadge status={m.status} />
                            {score !== null && <span>النقاط: {score}</span>}
                          </div>
                        </div>
                        {canManage && (
                          <TeamManagePanel teamId={id} mode="member-remove" memberId={m.id} name={m.full_name} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Leaderboard */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-4 w-4 text-gold-500" />
                لوحة ترتيب الفريق
              </CardTitle>
              <Link href={`/leaderboard?team=${id}`} className="text-xs font-semibold text-brand-700 hover:text-brand-800">
                العرض الكامل
              </Link>
            </CardHeader>
            <CardContent className="space-y-1">
              {ranked.length === 0 ? (
                <p className="text-sm text-slate-400">لا توجد بيانات ترتيب بعد.</p>
              ) : (
                ranked.slice(0, 10).map((e, i) => (
                  <div key={e.volunteer_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                    <span className={`w-6 text-center text-sm font-extrabold ${i < 3 ? "text-gold-500" : "text-slate-400"}`}>
                      {i + 1}
                    </span>
                    <Avatar name={e.full_name} src={e.avatar_url} size="sm" />
                    <span className="flex-1 truncate text-sm font-semibold text-slate-800">{e.full_name}</span>
                    <Badge tone={i < 3 ? "gold" : "slate"}>{e.overall_score ?? 0}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
