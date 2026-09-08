import Link from "next/link";
import { Truck, MapPin, CalendarDays, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { convoyTypeLabels } from "@/lib/i18n";
import type { Convoy, ConvoyStatus } from "@/lib/types";

const TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "الكل" },
  { key: "upcoming", label: "قادمة" },
  { key: "active", label: "نشطة" },
  { key: "completed", label: "منتهية" },
  { key: "cancelled", label: "ملغاة" },
];

export default async function ConvoysPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const current = TABS.some((t) => t.key === tab) ? tab! : "all";

  const supabase = await createClient();
  const { data: convoys } = await supabase
    .from("convoys")
    .select("*")
    .order("start_date", { ascending: false });

  const { data: participation } = await supabase
    .from("convoy_attendance")
    .select("convoy_id, volunteer_id, committee_id");

  const partMap = new Map<
    string,
    { volunteers: number; committees: Set<string> }
  >();
  for (const p of participation ?? []) {
    if (!p.committee_id) continue;
    const entry = partMap.get(p.convoy_id) ?? { volunteers: 0, committees: new Set<string>() };
    entry.volunteers += 1;
    entry.committees.add(p.committee_id);
    partMap.set(p.convoy_id, entry);
  }

  const all = (convoys ?? []) as Convoy[];
  const filtered = current === "all" ? all : all.filter((c) => c.status === current);
  const statusColor: Record<ConvoyStatus, string> = {
    upcoming: "text-blue-600",
    active: "text-emerald-600",
    completed: "text-slate-500",
    cancelled: "text-red-500",
  };

  return (
    <div>
      <PageHeader
        title="القوافل"
        description="متابعة القوافل الطبية والحضور والتقييمات"
        action={
          user.isAdmin ? (
            <Link href="/convoys/new">
              <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
                قافلة جديدة
              </span>
            </Link>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/convoys?tab=${t.key}`}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              current === t.key
                ? "bg-brand-700 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="لا توجد قوافل في هذا التصنيف"
          description={user.isAdmin ? "ابدأ بإنشاء قافلة جديدة." : "ستظهر القوافل هنا فور إعلانها."}
          action={
            user.isAdmin ? (
              <Link href="/convoys/new">
                <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
                  إنشاء قافلة
                </span>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((convoy) => {
            const part = partMap.get(convoy.id);
            return (
              <Link key={convoy.id} href={`/convoys/${convoy.id}`}>
                <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
                  <CardContent className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-extrabold text-slate-900">{convoy.name}</h2>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="teal">{convoyTypeLabels[convoy.type]}</Badge>
                      <StatusBadge status={convoy.status} />
                    </div>
                    <div className="mt-auto space-y-1.5 text-sm text-slate-500">
                      <p className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-slate-400" />
                        {formatDate(convoy.start_date)}
                        {convoy.end_date !== convoy.start_date && ` — ${formatDate(convoy.end_date)}`}
                      </p>
                      {convoy.location && (
                        <p className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-slate-400" />
                          <span className="truncate">{convoy.location}</span>
                        </p>
                      )}
                      {part && (
                        <p className={`flex items-center gap-2 text-xs font-semibold ${statusColor[convoy.status]}`}>
                          <Users className="h-4 w-4" />
                          مشاركة: {part.volunteers} متطوع في {part.committees.size} لجان
                        </p>
                      )}
                    </div>
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
