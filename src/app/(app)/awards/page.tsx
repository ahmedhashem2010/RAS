import Link from "next/link";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { AwardForm } from "@/components/awards/award-form";
import { formatDate } from "@/lib/utils";
import { awardTypeLabels } from "@/lib/i18n";

export default async function AwardsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const isAdmin = user.isAdmin;

  const awardsQuery = supabase
    .from("awards")
    .select("id, type, recipient_id, event_name, award_date, reason, created_at")
    .order("award_date", { ascending: false });
  if (isAdmin) {
    awardsQuery.limit(100);
  } else {
    awardsQuery.eq("recipient_id", user.id);
  }

  const [{ data: awards }, { data: profiles }, { data: convoys }] = await Promise.all([
    awardsQuery,
    supabase.from("profiles").select("id, full_name, avatar_url").order("full_name"),
    supabase.from("convoys").select("id, name, status").in("status", ["completed", "active"]).order("start_date", { ascending: false }).limit(50),
  ]);

  const nameMap = new Map<string, { full_name: string; avatar_url: string | null }>();
  for (const p of profiles ?? []) nameMap.set(p.id, p);

  return (
    <div>
      <PageHeader
        title="الجوائز"
        description={isAdmin ? "تكريم المتطوعين والقادة المتميزين" : "جوائزك وتكريماتك"}
        action={isAdmin ? <AwardForm profiles={profiles ?? []} convoys={convoys ?? []} /> : undefined}
      />

      {(awards ?? []).length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={isAdmin ? "لا توجد جوائز بعد" : "لم تحصل على جوائز بعد"}
          description={isAdmin ? "ابدأ بتكريم متطوع أو قائد متميز من الزر أعلاه." : "استمر في التميز — الجوائز تُمنح بأداء متميز."}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-50">
              {(awards ?? []).map((a) => {
                const p = nameMap.get(a.recipient_id);
                const isLeader = a.type === "best_leader";
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                    <Avatar name={p?.full_name ?? "؟"} src={p?.avatar_url} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={isLeader ? "gold" : "teal"}>{awardTypeLabels[a.type]}</Badge>
                        {isAdmin ? (
                          <Link
                            href={`/volunteers/${a.recipient_id}`}
                            className="text-sm font-bold text-slate-800 hover:text-brand-700"
                          >
                            {p?.full_name ?? "متطوع"}
                          </Link>
                        ) : (
                          <span className="text-sm font-bold text-slate-800">
                            {p?.full_name ?? user.profile.full_name}
                          </span>
                        )}
                      </div>
                      {a.reason && <p className="mt-1 truncate text-sm text-slate-500">{a.reason}</p>}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatDate(a.award_date)}
                        {a.event_name && ` · ${a.event_name}`}
                      </p>
                    </div>
                    <Trophy className={`h-5 w-5 shrink-0 ${isLeader ? "text-gold-500" : "text-brand-500"}`} />
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
