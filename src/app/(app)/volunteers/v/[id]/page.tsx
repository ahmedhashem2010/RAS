import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCommitteeManager } from "@/lib/auth";
import { getVolunteerById, getDepartments } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VolunteerDetailActions } from "@/components/volunteers/volunteer-detail-actions";
import { VolunteerAssessmentCard } from "@/components/volunteers/volunteer-assessment-card";
import { committeeRoleLabels, volunteerStatusLabels } from "@/lib/i18n";
import { Avatar } from "@/components/ui/avatar";

export default async function RosterVolunteerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCommitteeManager();
  const volunteer = await getVolunteerById(id);
  if (!volunteer) notFound();

  const committees = await getDepartments();
  const committeeNames = new Map(committees.map((c) => [c.id, c.name]));
  const canEdit = user.isAdmin || volunteer.committees.some((c) => user.ledCommitteeIds.includes(c.id));

  return (
    <div>
      <Link href="/volunteers" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
        → العودة للمتطوعين
      </Link>

      <PageHeader title={volunteer.full_name} description="بطاقة متطوع من سجل اللجان" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>البيانات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={volunteer.full_name} size="lg" />
              <div>
                <p className="text-base font-extrabold text-slate-900">{volunteer.full_name}</p>
                <p className="mt-0.5 text-sm text-slate-400">{volunteer.status === "active" ? "نشط" : volunteerStatusLabels[volunteer.status]}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-slate-400">الهاتف</p>
                <p className="mt-1 text-sm text-slate-700" dir="ltr">{volunteer.phone || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">اللجان</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {volunteer.committees.length ? (
                    volunteer.committees.map((c) => (
                      <Link key={c.id} href={`/committees/${c.name_en}`}>
                        <Badge tone="teal">{c.name}</Badge>
                      </Link>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">بدون لجنة</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">القيادة</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {volunteer.leadership.length ? (
                    volunteer.leadership.map((l, i) => (
                      <Badge key={i} tone={l.is_deputy ? "blue" : "gold"}>
                        {committeeRoleLabels[l.is_deputy ? "deputy" : "leader"]} · {committeeNames.get(l.committee_id) ?? ""}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">الحساب</p>
                <p className="mt-1 text-sm text-slate-700">
                  {volunteer.profile_id ? (
                    <Link href={`/volunteers/${volunteer.profile_id}`} className="text-brand-700 hover:underline">
                      حسابه مفعل — عرض الملف الشخصي
                    </Link>
                  ) : (
                    "دون حساب دخول"
                  )}
                </p>
              </div>
            </div>

            {volunteer.notes && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-400">ملاحظات</p>
                <p className="mt-1 text-sm text-slate-700">{volunteer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>إجراءات</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <VolunteerDetailActions
              id={volunteer.id}
              status={volunteer.status}
              profileId={volunteer.profile_id}
              canEdit={canEdit}
              canManage={user.isAdmin}
              canDelete={user.isSuperAdmin && volunteer.leadership.length === 0}
              canLink={user.isSuperAdmin}
              fullName={volunteer.full_name}
            />
            <Link href="/volunteers">
              <Button variant="secondary" className="w-full">العودة للقائمة</Button>
            </Link>
          </CardContent>
        </Card>

        <VolunteerAssessmentCard
          volunteerId={volunteer.id}
          fullName={volunteer.full_name}
          rating={volunteer.rating}
          description={volunteer.description}
          notes={volunteer.notes}
          canEdit={user.isAdmin}
        />
      </div>
    </div>
  );
}