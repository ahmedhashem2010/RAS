import { Users, Truck, Trophy, ShieldAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAdminOverview } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/utils";

export default async function AnalyticsPage() {
  await requireAdmin();
  const overview = await getAdminOverview();

  return (
    <div>
      <PageHeader
        title="التحليلات"
        description="نظرة عامة على نشاط المتطوعين والقوافل"
      />

      {/* Top stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="إجمالي المتطوعين" value={overview.totalVolunteers} hint={`${overview.activeVolunteers} نشط`} tone="teal" />
        <StatCard icon={Truck} label="القوافل القادمة" value={overview.upcomingCount} hint={overview.upcoming?.name} tone="blue" />
        <StatCard icon={Trophy} label="الجوائز" value={overview.totalAwards} tone="gold" />
        <StatCard icon={ShieldAlert} label="إنذارات نشطة" value={overview.activeWarnings} tone={overview.activeWarnings > 0 ? "red" : "slate"} />
      </div>

      {/* Upcoming + recent convoy */}
      <div className="grid gap-6 lg:grid-cols-2">
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