import Link from "next/link";
import {
  Users,
  Truck,
  ShieldAlert,
  Trophy,
  MapPin,
  CalendarDays,
  Gauge,
  Plus,
} from "lucide-react";
import { getAdminOverview, getRecentActivity } from "@/lib/analytics";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, timeAgo } from "@/lib/utils";
import { convoyTypeLabels } from "@/lib/i18n";

const activityTone = {
  rating: "green",
  task: "teal",
  convoy: "blue",
  award: "gold",
  warning: "red",
  member: "slate",
} as const;

export async function AdminDashboard() {
  const [overview, recentActivity] = await Promise.all([
    getAdminOverview(),
    getRecentActivity(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة التحكم"
        description="نظرة عامة على نشاط منظمة قوافل طبية"
        action={
          <Link href="/convoys/new">
            <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
              <Plus className="h-4 w-4" />
              قافلة جديدة
            </span>
          </Link>
        }
      />

      {/* Warning alerts — prominent */}
      {overview.warningAlerts.length > 0 && (
        <div className="space-y-2">
          {overview.warningAlerts.map((w) => (
            <Link
              key={w.volunteer_id}
              href={`/volunteers/${w.volunteer_id}`}
              className={`flex items-center gap-3 rounded-xl border p-4 transition-shadow hover:shadow-card ${
                w.count >= overview.warningLimit
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <ShieldAlert className={`h-5 w-5 ${w.count >= overview.warningLimit ? "text-red-600" : "text-amber-600"}`} />
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-800">
                  {w.full_name} — {w.count} من {overview.warningLimit} إنذارات
                </p>
                <p className="text-xs text-slate-500">
                  {w.count >= overview.warningLimit
                    ? `وصل المتطوع إلى ${overview.warningLimit} إنذارات — يرجى المراجعة واتخاذ القرار.`
                    : `قريب من حد الإنذارات (${overview.warningLimit}).`}
                </p>
              </div>
              <Badge tone={w.count >= overview.warningLimit ? "red" : "amber"}>
                {w.count >= overview.warningLimit ? "مراجعة مطلوبة" : "متابعة"}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="إجمالي المتطوعين" value={overview.totalVolunteers} tone="teal" hint={`${overview.activeVolunteers} نشط`} />
        <StatCard icon={Truck} label="قوافل قادمة" value={overview.upcomingCount} tone="blue" hint={overview.upcoming?.name} />
        <StatCard icon={Gauge} label="متوسط نقاط المتطوعين" value={overview.avgScore} tone="slate" hint="من 100" />
        <StatCard icon={Trophy} label="الجوائز" value={overview.totalAwards} tone="gold" />
        <StatCard icon={ShieldAlert} label="إنذارات نشطة" value={overview.activeWarnings} tone="red" hint={`من ${overview.warningLimit - 1} إلى ${overview.warningLimit} إنذارات`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Upcoming convoy */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-brand-600" />
                القافلة القادمة
              </CardTitle>
            </CardHeader>
            {overview.upcoming ? (
              <CardContent>
                <Link href={`/convoys/${overview.upcoming.id}`} className="group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-extrabold text-slate-900 group-hover:text-brand-700">
                        {overview.upcoming.name}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge tone="teal">{convoyTypeLabels[overview.upcoming.type]}</Badge>
                        <StatusBadge status={overview.upcoming.status} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm text-slate-500">
                    <p className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-slate-400" />
                      {formatDate(overview.upcoming.start_date)} — {formatDate(overview.upcoming.end_date)}
                    </p>
                    {overview.upcoming.location && (
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        {overview.upcoming.location}
                      </p>
                    )}
                  </div>
                </Link>
              </CardContent>
            ) : (
              <CardContent>
                <p className="text-sm text-slate-500">لا توجد قوافل قادمة.</p>
                <Link href="/convoys/new" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800">
                  إنشاء قافلة جديدة
                </Link>
              </CardContent>
            )}
          </Card>

          {/* Recent convoy */}
          {overview.recentConvoy && (
            <Card>
              <CardHeader>
                <CardTitle>آخر قافلة منتهية</CardTitle>
              </CardHeader>
              <CardContent>
                <Link href={`/convoys/${overview.recentConvoy.id}`} className="group">
                  <p className="text-base font-extrabold text-slate-900 group-hover:text-brand-700">
                    {overview.recentConvoy.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone="teal">{convoyTypeLabels[overview.recentConvoy.type]}</Badge>
                    <Badge tone="green">منتهية</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {formatDate(overview.recentConvoy.start_date)}
                  </p>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>أحدث النشاطات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-slate-50">
                <Badge tone={activityTone[item.kind]} className="mt-0.5 px-2 py-1 text-[10px]">
                  {item.kind === "rating" ? "تقييم" : item.kind === "task" ? "مهمة" : item.kind === "convoy" ? "قافلة" : item.kind === "award" ? "جائزة" : "إنذار"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                  {item.detail && <p className="text-xs text-slate-400">{item.detail}</p>}
                </div>
                <span className="shrink-0 text-xs text-slate-400">{timeAgo(item.at)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
