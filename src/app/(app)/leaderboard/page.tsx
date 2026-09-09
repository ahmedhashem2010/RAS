import { Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getGlobalLeaderboard } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export default async function LeaderboardPage() {
  const user = await requireUser();
  const board = await getGlobalLeaderboard();

  const ranked = [...board]
    .filter((b) => b.status === "active")
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));

  return (
    <div>
      <PageHeader
        title="لوحة الترتيب"
        description="الترتيب العام للمتطوعين حسب النقاط الإجمالية"
      />

      {ranked.length === 0 ? (
        <EmptyState
          icon={Star}
          title="لا توجد بيانات ترتيب بعد"
          description="سيظهر الترتيب فور احتساب النقاط."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
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
                      <p className="text-[11px] text-slate-400">
                        حضور {e.attendance_percent ?? 0}% · مهام {e.task_percent ?? 0}% · قوافل {e.convoy_percent ?? 0}%
                        {e.joined_at ? ` · انضم ${formatDate(e.joined_at)}` : ""}
                      </p>
                    </div>
                    <Badge tone={isTop3 ? "gold" : "slate"}>
                      {e.overall_score ?? 0}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}