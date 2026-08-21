import { BarChart3, Users, Truck, Trophy, ShieldAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAdminOverview, getTeamActivity } from "@/lib/analytics";import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

const colorMap: Record<string, string> = {
  "#0d9488": "bg-brand-600",
  "#2563eb": "bg-blue-600",
  "#d97706": "bg-amber-500",
  "#dc2626": "bg-red-600",
  "#7c3aed": "bg-violet-600",
  "#059669": "bg-emerald-600",
  "#db2777": "bg-pink-600",
  "#0891b2": "bg-cyan-600",
};

export default async function AnalyticsPage() {
  await requireAdmin();
  const [overview, activity] = await Promise.all([getAdminOverview(), getTeamActivity()]);

  return (
    <div>
      <PageHeader
        title="التحليلات"
        description="نظرة عامة على نشاط الفرق والمتطوعين"
      />

      {/* Top stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="إجمالي المتطوعين" value={overview.totalVolunteers} hint={`${overview.activeVolunteers} نشط`} tone="teal" />
        <StatCard icon={Truck} label="القوافل القادمة" value={overview.upcomingCount} hint={overview.upcoming?.name} tone="blue" />
        <StatCard icon={Trophy} label="الجوائز" value={overview.totalAwards} tone="gold" />
        <StatCard icon={ShieldAlert} label="إنذارات نشطة" value={overview.activeWarnings} tone={overview.activeWarnings > 0 ? "red" : "slate"} />
      </div>

      {/* Team activity */}
      <Card>
        <CardHeader>
          <CardTitle>نشاط الفرق</CardTitle>
          <Badge tone="slate">درجة النشاط</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {activity.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={BarChart3} title="لا توجد بيانات نشاط بعد" />
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {activity.map((t, i) => (
                <div key={t.team_id} className="px-4 py-4 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`h-3 w-3 shrink-0 rounded-full ${colorMap[t.color] ?? "bg-slate-400"}`}
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="text-sm font-bold text-slate-800">{t.name}</span>
                      <Badge tone={i === 0 ? "gold" : i <= 3 ? "green" : "slate"}>{t.activity_score} نقطة</Badge>
                    </div>
                    <span className="hidden text-xs text-slate-400 sm:block">
                      {t.member_count} عضو
                    </span>
                  </div>
                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-brand-600 to-brand-400"
                      style={{ width: `${Math.min(100, t.activity_score)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <span>حضور: {t.attendance_rate === null ? "—" : `${t.attendance_rate}%`}</span>
                    <span>مهام: {t.task_completion === null ? "—" : `${t.task_completion}%`}</span>
                    <span>أداء: {t.avg_performance === null ? "—" : `${t.avg_performance}/5`}</span>
                    <span>قوافل: {t.convoy_count}</span>
                    <span>متوسط النقاط: {t.avg_score === null ? "—" : t.avg_score}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming + recent convoy */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>القافلة القادمة</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.upcoming ? (
              <div>
                <p className="text-sm font-bold text-slate-800">{overview.upcoming.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDate(overview.upcoming.start_date)}
                  {" — "}
                  {formatDate(overview.upcoming.end_date)}
                </p>
                <Badge tone="blue" className="mt-2">قادمة</Badge>
              </div>
            ) : (
              <p className="text-sm text-slate-400">لا توجد قوافل قادمة.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>آخر قافلة منتهية</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.recentConvoy ? (
              <div>
                <p className="text-sm font-bold text-slate-800">{overview.recentConvoy.name}</p>
                <p className="mt-1 text-sm text-slate-500">{formatDate(overview.recentConvoy.end_date)}</p>
                <Badge tone="green" className="mt-2">منتهية</Badge>
              </div>
            ) : (
              <p className="text-sm text-slate-400">لم تُنهَ أي قافلة بعد.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Warning alerts */}
      {overview.warningAlerts.length > 0 && (
        <Card className="mt-6 border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-amber-800">متطوعون على وشك الوصول للحد الأقصى من الإنذارات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {overview.warningAlerts.map((w) => (
                <span
                  key={w.volunteer_id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-amber-200"
                >
                  {w.full_name}
                  <Badge tone="red">{w.count} إنذارات</Badge>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
