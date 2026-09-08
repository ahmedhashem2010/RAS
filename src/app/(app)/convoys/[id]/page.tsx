import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MapPin,
  CalendarDays,
  Truck,
  ClipboardList,
  Trophy,
  ArrowRight,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getAllCommitteesWithLeaders } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { StarRating } from "@/components/ui/star-rating";
import { PageHeader } from "@/components/ui/page-header";
import { ConvoyStatusActions } from "@/components/convoys/convoy-status-actions";
import { DeleteConvoyButton } from "@/components/convoys/delete-convoy-button";
import { ConvoyLeadersPicker } from "@/components/convoys/convoy-leaders-picker";
import { formatDate } from "@/lib/utils";
import { convoyTypeLabels } from "@/lib/i18n";
import type { ConvoyStatus } from "@/lib/types";

export default async function ConvoyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: convoy } = await supabase
    .from("convoys")
    .select("*")
    .eq("id", id)
    .single();
  if (!convoy) notFound();

  const [attendanceRes, evalsRes, committees, convoyLeadersRes, awardsRes] = await Promise.all([
    supabase.from("convoy_attendance").select("*").eq("convoy_id", id),
    supabase.from("convoy_evaluations").select("*").eq("convoy_id", id),
    getAllCommitteesWithLeaders(),
    supabase.from("convoy_leaders").select("*").eq("convoy_id", id),
    supabase
      .from("awards")
      .select("*, profiles!awards_recipient_id_fkey(id, full_name)")
      .eq("convoy_id", id)
      .order("award_date", { ascending: false }),
  ]);

  const attendance = attendanceRes.data ?? [];
  const evaluations = evalsRes.data ?? [];
  const awards = awardsRes.data ?? [];
  const convoyLeaders = convoyLeadersRes.data ?? [];
  const committeeName = new Map(committees.map((c) => [c.id, c.name]));

  const profileIds = [
    ...new Set([
      ...attendance.map((a) => a.volunteer_id),
      ...attendance.map((a) => a.marked_by),
      ...evaluations.map((e) => e.volunteer_id),
      ...evaluations.map((e) => e.leader_id),
      ...convoyLeaders.map((l) => l.leader_id),
      ...awards.map((a) => a.recipient_id),
    ]),
  ].filter(Boolean);

  const { data: profilesData } = profileIds.length
    ? await supabase.rpc("get_profiles", { p_ids: profileIds })
    : { data: null };
  const profiles = (profilesData ?? []) as Array<{ id: string; full_name: string; avatar_url: string | null }>;

  const nameOf = (pid: string) =>
    (profiles.find((p) => p.id === pid) as { full_name?: string } | undefined)?.full_name ?? "متطوع";

  // Per-committee attendance summary
  const committeeSummary = new Map<string, { present: number; excused: number; absent: number }>();
  for (const a of attendance) {
    if (!a.committee_id) continue;
    const entry = committeeSummary.get(a.committee_id) ?? { present: 0, excused: 0, absent: 0 };
    entry[a.status as "present" | "excused" | "absent"] += 1;
    committeeSummary.set(a.committee_id, entry);
  }
  const points = attendance.reduce(
    (s, a) => s + (a.status === "present" ? 1 : a.status === "excused" ? 0.5 : 0),
    0,
  );

  const evalRows = evaluations.map((e) => ({
    ...e,
    volunteerName: nameOf(e.volunteer_id),
    leaderName: nameOf(e.leader_id),
    committee: e.committee_id ? committeeName.get(e.committee_id) ?? "لجنة" : "—",
  }));

  // Leaders marked as attending (for the super-admin picker).
  const markedLeaderIds = new Set(convoyLeaders.map((l) => l.leader_id));
  const allLeaders = committees.flatMap((c) =>
    c.leaders.map((l) => ({
      profileId: l.profileId,
      fullName: l.fullName,
      committeeName: c.name,
      isDeputy: l.isDeputy,
    })),
  );

  const isLocked = convoy.status === "completed" || convoy.status === "cancelled";

  return (
    <div className="space-y-6">
      <PageHeader
        title={convoy.name}
        description={`${convoyTypeLabels[convoy.type]} · ${formatDate(convoy.start_date)} — ${formatDate(convoy.end_date)}`}
        action={
          <Link href="/convoys" className="inline-flex h-10 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowRight className="h-4 w-4" />
            كل القوافل
          </Link>
        }
      />

      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex items-center gap-3">
          <StatusBadge status={convoy.status} />
          {isLocked && (
            <span className="text-xs text-slate-400">
              القافلة {convoy.status === "completed" ? "مغلقة" : "ملغاة"} — لا يمكن تعديل الحضور أو التقييمات
            </span>
          )}
        </div>
        {user.isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <ConvoyStatusActions convoyId={convoy.id} status={convoy.status as ConvoyStatus} />
            <DeleteConvoyButton convoyId={convoy.id} convoyName={convoy.name} />
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>التفاصيل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                {formatDate(convoy.start_date)} — {formatDate(convoy.end_date)}
              </p>
              <p className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-slate-400" />
                {convoyTypeLabels[convoy.type]}
              </p>
              {convoy.location && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {convoy.location}
                </p>
              )}
              {convoy.description && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
                  {convoy.description}
                </p>
              )}
              {convoy.instructions && (
                <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
                  <p className="mb-1 text-xs font-bold text-brand-800">تعليمات للمتطوعين</p>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                    {convoy.instructions}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Which leaders attended (super admin control) */}
          {user.isSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand-700" />
                  القادة الحاضرون
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLocked ? (
                  <div className="space-y-2">
                    {convoyLeaders.length === 0 ? (
                      <p className="text-sm text-slate-400">لم يتم تحديد قادة حاضرين.</p>
                    ) : (
                      convoyLeaders.map((l) => (
                        <div key={l.leader_id} className="flex items-center gap-2 text-sm text-slate-700">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          {nameOf(l.leader_id)}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <ConvoyLeadersPicker
                    convoyId={convoy.id}
                    leaders={allLeaders}
                    initial={[...markedLeaderIds]}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions for leaders */}
          {(user.isAdmin || user.isCommitteeLeader) && (
            <Card>
              <CardHeader>
                <CardTitle>إدارة القافلة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!isLocked && (
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/convoys/${convoy.id}/attendance`}>
                      <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
                        <ClipboardList className="h-4 w-4" />
                        تسجيل الحضور
                      </span>
                    </Link>
                    <Link href={`/convoys/${convoy.id}/evaluate`}>
                      <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        تقييم الأداء
                      </span>
                    </Link>
                  </div>
                )}
                <p className="text-xs text-slate-400">
                  كل قائد لجنة يسجل حضور متطوعي لجنته فقط بعد تحديده كقائد حاضر من مدير النظام.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          {/* Attendance summary per committee */}
          <Card>
            <CardHeader>
              <CardTitle>ملخص الحضور</CardTitle>
              <Badge tone="teal">نقاط الحضور: {points}</Badge>
            </CardHeader>
            <CardContent>
              {attendance.length === 0 ? (
                <EmptyState
                  title="لم يتم تسجيل الحضور بعد"
                  description="سيقوم القادة الحاضرون بتسجيل حضور لجانهم خلال القافلة."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-right text-xs text-slate-400">
                        <th className="pb-2 font-medium">اللجنة</th>
                        <th className="pb-2 font-medium">
                          <span className="text-emerald-600">حاضر</span>
                        </th>
                        <th className="pb-2 font-medium">
                          <span className="text-amber-600">معذور</span>
                        </th>
                        <th className="pb-2 font-medium">
                          <span className="text-red-600">غائب</span>
                        </th>
                        <th className="pb-2 font-medium">المجموع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...committeeSummary.entries()].map(([cid, s]) => (
                        <tr key={cid} className="border-b border-slate-50">
                          <td className="py-2.5 font-bold text-slate-800">{committeeName.get(cid) ?? "لجنة"}</td>
                          <td className="py-2.5 font-semibold text-emerald-600">{s.present}</td>
                          <td className="py-2.5 font-semibold text-amber-600">{s.excused}</td>
                          <td className="py-2.5 font-semibold text-red-600">{s.absent}</td>
                          <td className="py-2.5 font-bold text-slate-700">{s.present + s.excused + s.absent}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Evaluations */}
          <Card>
            <CardHeader>
              <CardTitle>تقييمات الأداء</CardTitle>
              <Badge tone="gold">{evaluations.length} تقييم</Badge>
            </CardHeader>
            <CardContent>
              {evalRows.length === 0 ? (
                <EmptyState
                  title="لا توجد تقييمات بعد"
                  description="تقييمات الأداء تظهر بعد قيام القادة الحاضرين بالتقييم."
                />
              ) : (
                <div className="space-y-3">
                  {evalRows.map((e) => (
                    <div key={e.id} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.volunteerName} size="sm" />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-800">{e.volunteerName}</p>
                          <p className="text-xs text-slate-400">
                            {e.committee} · بقلم {e.leaderName}
                          </p>
                        </div>
                        <StarRating value={e.rating} readOnly size="sm" />
                      </div>
                      {e.comment && (
                        <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600">
                          {e.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Awards */}
          {awards.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-gold-500" />
                  جوائز هذه القافلة
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {awards.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                    <Trophy className="h-5 w-5 text-gold-500" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">
                        {(a.profiles as { full_name: string } | null)?.full_name ?? "متطوع"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {a.type === "best_leader" ? "أفضل قائد" : "المتطوع المثالي"}
                        {a.reason ? ` — ${a.reason}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
