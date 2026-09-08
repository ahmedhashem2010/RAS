import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCommitteeManager } from "@/lib/auth";
import { getDepartmentBySlug, getCommitteeWithLeaders, getVolunteerDetails } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { CommitteeLeadersPanel } from "@/components/committees/committee-leaders-panel";
import { Avatar } from "@/components/ui/avatar";
import { Users, Crown, Building2 } from "lucide-react";

export default async function CommitteeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireCommitteeManager();

  const dept = await getDepartmentBySlug(slug);
  if (!dept) notFound();

  const isLedByUser = user.ledCommitteeIds.includes(dept.id);
  if (!user.isAdmin && !isLedByUser) redirect("/committees");

  const [committee, volunteers] = await Promise.all([
    getCommitteeWithLeaders(dept),
    getVolunteerDetails(),
  ]);

  const members = volunteers.filter((v) => v.committees.some((c) => c.id === dept.id));
  const activeMembers = members.filter((v) => v.status === "active");
  const leaderVolunteerIds = new Set(committee.leaders.map((l) => l.volunteerId));

  return (
    <div>
      <Link href="/committees" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
        → العودة للجان
      </Link>

      <PageHeader
        title={committee.name}
        description={committee.description ?? "لجنة متخصصة في النظام"}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard icon={Users} label="الأعضاء" value={committee.memberCount} tone="teal" />
        <StatCard icon={Users} label="نشطون" value={activeMembers.length} tone="teal" />
        <StatCard icon={Crown} label="القادة والنواب" value={committee.leaders.length} tone="gold" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>أعضاء اللجنة</CardTitle>
            <span className="text-xs font-semibold text-slate-400">
              {members.length} متطوع
            </span>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">لا يوجد أعضاء في هذه اللجنة بعد.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {members.map((v) => (
                  <Link
                    key={v.id}
                    href={v.profile_id ? `/volunteers/${v.profile_id}` : `/volunteers/v/${v.id}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                  >
                    <Avatar name={v.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{v.full_name}</p>
                      {v.phone && <p className="truncate text-xs text-slate-400" dir="ltr">{v.phone}</p>}
                    </div>
                    {v.status === "inactive" && <Badge tone="slate" className="text-[10px]">منسحب</Badge>}
                    {leaderVolunteerIds.has(v.id) && (
                      <Badge tone="gold" className="text-[10px]">
                        {v.leadership.find((l) => l.committee_id === dept.id)?.is_deputy ? "نائب القائد" : "قائد"}
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Building2 className="ml-1 inline h-4 w-4 text-slate-400" />
              إدارة القيادة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CommitteeLeadersPanel
              committeeId={committee.id}
              leaders={committee.leaders}
              volunteers={volunteers}
              canManage={user.isSuperAdmin}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}