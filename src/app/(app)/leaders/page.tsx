import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { getAllCommitteesWithLeaders } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImpersonateButton } from "@/components/admin/impersonate-button";
import { Crown, ChevronLeft } from "lucide-react";
import { committeeRoleLabels } from "@/lib/i18n";

export const metadata = {
  title: "قادة اللجان | RAS",
  description: "إدارة قادة ونواب اللجان",
};

export default async function LeadersPage() {
  await requireSuperAdmin();
  const committees = await getAllCommitteesWithLeaders();

  const allLeaders = committees
    .flatMap((c) =>
      c.leaders.map((l) => ({ ...l, committee: c })),
    )
    .sort((a, b) => Number(a.isDeputy) - Number(b.isDeputy));

  return (
    <div>
      <PageHeader
        title="قادة اللجان"
        description={`${allLeaders.length} منصب قيادي في ${committees.length} لجنة`}
      />

      <Card>
        <CardHeader>
          <CardTitle>جميع القيادات</CardTitle>
        </CardHeader>
        <CardContent>
          {allLeaders.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">لا توجد قيادات مسجلة بعد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-right text-xs font-semibold text-slate-400">
                    <th className="px-4 py-3">الاسم</th>
                    <th className="px-4 py-3">اللجنة</th>
                    <th className="px-4 py-3">المنصب</th>
                    <th className="px-4 py-3">حساب الدخول</th>
                    <th className="px-4 py-3 text-left">عرض</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {allLeaders.map((l, i) => (
                    <tr key={`${l.volunteerId}-${i}`} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-bold text-slate-800">
                          <Crown className={`h-4 w-4 ${l.isDeputy ? "text-blue-500" : "text-amber-500"}`} />
                          {l.fullName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{l.committee.name}</td>
                      <td className="px-4 py-3">
                        <Badge tone={l.isDeputy ? "blue" : "gold"} className="text-[10px]">
                          {committeeRoleLabels[l.isDeputy ? "deputy" : "leader"]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {l.profileId ? (
                          <Badge tone="green" className="text-[10px]">مفعل</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">دون حساب</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-left">
                        <div className="flex items-center justify-end gap-2">
                          {l.profileId && (
                            <ImpersonateButton
                              profileId={l.profileId}
                              committeeId={l.committee.id}
                              committeeName={l.committee.name}
                            />
                          )}
                          <Link
                            href={l.profileId ? `/volunteers/${l.profileId}` : `/volunteers/v/${l.volunteerId}`}
                            className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800"
                          >
                            عرض
                            <ChevronLeft className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}