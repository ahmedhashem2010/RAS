import Link from "next/link";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getTeamLeaderboard } from "@/lib/queries";
import { getSettings } from "@/lib/actions/settings";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const user = await requireUser();
  const { team: teamParam } = await searchParams;
  const supabase = await createClient();
  const settings = await getSettings();

  const [{ data: teams }, { data: myTeams }] = await Promise.all([
    supabase.from("teams").select("*").order("name"),
    supabase.from("team_members").select("team_id").eq("volunteer_id", user.id),
  ]);

  const myTeamIds = new Set((myTeams ?? []).map((t) => t.team_id));

  let accessibleTeamIds: string[];
  if (user.isAdmin) {
    accessibleTeamIds = (teams ?? []).map((t) => t.id);
  } else if (user.isTeamLeader) {
    accessibleTeamIds = settings.leaderboard_visible_to_all
      ? (teams ?? []).map((t) => t.id)
      : [...new Set([...user.ledTeamIds, ...myTeamIds])];
  } else {
    accessibleTeamIds = settings.leaderboard_visible_to_all
      ? (teams ?? []).map((t) => t.id)
      : [...myTeamIds];
  }

  const visibleTeams = (teams ?? []).filter((t) => accessibleTeamIds.includes(t.id));
  const selectedTeamId = teamParam && accessibleTeamIds.includes(teamParam) ? teamParam : visibleTeams[0]?.id;

  const board = selectedTeamId ? await getTeamLeaderboard(selectedTeamId) : [];
  const ranked = [...board]
    .filter((b) => b.status === "active")
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));

  const canSeeDetails = user.isAdmin || user.isTeamLeader || settings.leaderboard_visible_to_all;

  return (
    <div>
      <PageHeader
        title="لوحة الترتيب"
        description="ترتيب المتطوعين حسب النقاط الإجمالية"
      />

      {visibleTeams.length === 0 ? (
        <EmptyState
          icon={Star}
          title="أنت لست عضواً في أي فريق بعد"
          description="سيظهر ترتيب فريقك هنا فور انضمامك."
        />
      ) : (
        <>
          <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1">
            {visibleTeams.map((t) => (
              <Link
                key={t.id}
                href={`/leaderboard?team=${t.id}`}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  t.id === selectedTeamId
                    ? "bg-brand-700 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {t.name}
              </Link>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              {ranked.length === 0 ? (
                <div className="p-8">
                  <EmptyState title="لا توجد بيانات ترتيب بعد" />
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {ranked.map((e, i) => {
                    const highlight = e.volunteer_id === user.id;
                    const isTop3 = i < 3;
                    return (
                      <div
                        key={e.volunteer_id}
                        className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${highlight ? "bg-brand-50/50" : ""}`}
                      >
                        <span className={`w-8 text-center text-base font-extrabold ${isTop3 ? "text-gold-500" : "text-slate-400"}`}>
                          {i + 1}
                        </span>
                        <Avatar name={e.full_name} src={e.avatar_url} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-800">
                            {e.full_name}
                            {highlight && <span className="mr-1 text-xs font-semibold text-brand-600">(أنت)</span>}
                          </p>
                          {canSeeDetails && (
                            <p className="text-[11px] text-slate-400">
                              حضور {e.attendance_percent ?? 0}% · مهام {e.task_percent ?? 0}% · قوافل {e.convoy_percent ?? 0}%
                            </p>
                          )}
                        </div>
                        <Badge tone={isTop3 ? "gold" : "slate"}>
                          {e.overall_score ?? 0}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {!canSeeDetails && (
            <p className="mt-3 text-center text-xs text-slate-400">
              تظهر التفاصيل الكاملة للأداء للمديرين وقادة الفرق فقط.
            </p>
          )}
        </>
      )}
    </div>
  );
}
