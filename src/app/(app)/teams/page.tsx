import Link from "next/link";
import { Users, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getTeamActivity } from "@/lib/analytics";
import { Avatar } from "@/components/ui/avatar";
import { evalModeLabels } from "@/lib/i18n";

export default async function TeamsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [activity, leadersRes] = await Promise.all([
    getTeamActivity(),
    supabase.from("team_leaders").select("team_id, leader_id, profiles(id, full_name, avatar_url)"),
  ]);

  const leadersByTeam = new Map<string, Array<{ id: string; full_name: string; avatar_url: string | null }>>();
  for (const l of leadersRes.data ?? []) {
    const p = l.profiles as unknown as { id: string; full_name: string; avatar_url: string | null };
    const arr = leadersByTeam.get(l.team_id) ?? [];
    arr.push(p);
    leadersByTeam.set(l.team_id, arr);
  }

  const canManage = user.isAdmin;

  return (
    <div>
      <PageHeader
        title="الفرق"
        description="إدارة فرق العمل وأعضائها وقادتها"
        action={
          canManage ? (
            <Link href="/teams/new">
              <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
                <Plus className="h-4 w-4" />
                فريق جديد
              </span>
            </Link>
          ) : undefined
        }
      />

      {activity.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا توجد فرق بعد"
          description="سيقوم مدير النظام بإنشاء الفرق."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activity.map((team) => {
            const leaders = leadersByTeam.get(team.team_id) ?? [];
            return (
              <Link key={team.team_id} href={`/teams/${team.team_id}`}>
                <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
                  <CardContent className="flex h-full flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-10 w-10 rounded-xl"
                        style={{ backgroundColor: `${team.color}20` }}
                      >
                        <span
                          className="flex h-full w-full items-center justify-center text-lg font-extrabold"
                          style={{ color: team.color }}
                        >
                          {team.name[0]}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-base font-extrabold text-slate-900">
                          {team.name}
                        </h2>
                        <Badge tone={team.convoy_count > 0 ? "teal" : "slate"} className="text-[10px]">
                          {evalModeLabels[team.eval_mode]}
                        </Badge>
                      </div>
                      <span className="text-sm font-extrabold text-brand-700">
                        {team.activity_score}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {team.member_count} متطوع
                      </span>
                      <span>{team.convoy_count} قافلة</span>
                    </div>

                    {leaders.length > 0 && (
                      <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3">
                        <div className="flex -space-x-2">
                          {leaders.slice(0, 3).map((l) => (
                            <Avatar key={l.id} name={l.full_name} src={l.avatar_url} size="sm" className="ring-2 ring-white" />
                          ))}
                        </div>
                        <span className="text-xs font-semibold text-slate-500">
                          {leaders.length === 1 ? "قائد واحد" : `${leaders.length} قادة`}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
