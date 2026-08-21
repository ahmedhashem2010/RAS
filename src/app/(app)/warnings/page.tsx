import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/actions/settings";
import { warningAtRiskThreshold } from "@/lib/warnings";
import { requireAdmin } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WarningsTable } from "@/components/warnings/warnings-table";
import { formatDate } from "@/lib/utils";

export default async function WarningsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const settings = await getSettings();
  const atRiskThreshold = warningAtRiskThreshold(settings.warning_limit);

  const [{ data: warnings }, { data: profiles }] = await Promise.all([
    supabase
      .from("warnings")
      .select("id, number, reason, warning_date, created_at, volunteer_id, issued_by")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, full_name, avatar_url"),
  ]);

  const nameMap = new Map<string, { full_name: string; avatar_url: string | null }>();
  for (const p of profiles ?? []) nameMap.set(p.id, p);

  const rows = (warnings ?? []).map((w) => {
    const vol = nameMap.get(w.volunteer_id);
    const issuer = nameMap.get(w.issued_by);
    return {
      ...w,
      volunteer_name: vol?.full_name ?? "متطوع",
      volunteer_avatar: vol?.avatar_url ?? null,
      issued_by_name: issuer?.full_name ?? "—",
    };
  });

  const byVolunteer = new Map<string, number>();
  for (const w of warnings ?? []) byVolunteer.set(w.volunteer_id, Math.max(byVolunteer.get(w.volunteer_id) ?? 0, w.number));
  const onAlert = [...byVolunteer.entries()].filter(([, n]) => n >= atRiskThreshold).length;

  return (
    <div>
      <PageHeader
        title="الإنذارات"
        description={onAlert > 0 ? `${onAlert} متطوع وصل لـ ${atRiskThreshold} إنذارات أو أكثر` : "سجل الإنذارات الصادرة للمتطوعين"}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="لا توجد إنذارات بعد"
          description="ستظهر الإنذارات هنا عند إصدارها للمتطوعين."
        />
      ) : (
        <>
          {onAlert > 0 && (
            <Card className="mb-4 border-amber-200 bg-amber-50/60">
              <CardContent className="py-3">
                <p className="text-sm font-semibold text-amber-800">
                  تنبيه: يوجد متطوعون وصلوا لـ {atRiskThreshold} إنذارات أو أكثر — يُنصح باتخاذ قرار (حظر أو متابعة).
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...byVolunteer.entries()]
                    .filter(([, n]) => n >= atRiskThreshold)
                    .sort((a, b) => b[1] - a[1])
                    .map(([id, n]) => {
                      const v = nameMap.get(id);
                      return (
                        <Link
                          key={id}
                          href={`/volunteers/${id}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                        >
                          <Avatar name={v?.full_name ?? "؟"} src={v?.avatar_url} size="sm" className="h-5 w-5 text-[9px]" />
                          {v?.full_name ?? "متطوع"}
                          <Badge tone="red">{n} إنذارات</Badge>
                        </Link>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <WarningsTable rows={rows} />
            </CardContent>
          </Card>

          <p className="mt-3 text-center text-xs text-slate-400">
            آخر إنذار بتاريخ {formatDate(rows[0]?.created_at)}
          </p>
        </>
      )}
    </div>
  );
}
