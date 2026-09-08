import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCommitteeManager } from "@/lib/auth";
import { getAllCommitteesWithLeaders } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EvaluationEditor } from "@/components/convoys/evaluation-editor";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRight, Star } from "lucide-react";
import Link from "next/link";
import { convoyTypeLabels } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { RosterVolunteer } from "@/lib/types";

export default async function ConvoyEvaluatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ committee?: string }>;
}) {
  const { id } = await params;
  const { committee: committeeParam } = await searchParams;
  const user = await requireCommitteeManager();
  const supabase = await createClient();

  const { data: convoy } = await supabase
    .from("convoys")
    .select("*")
    .eq("id", id)
    .single();
  if (!convoy) notFound();

  const [committees, convoyLeadersRes] = await Promise.all([
    getAllCommitteesWithLeaders(),
    supabase.from("convoy_leaders").select("leader_id").eq("convoy_id", id),
  ]);

  const markedLeaderIds = new Set((convoyLeadersRes.data ?? []).map((r) => r.leader_id));

  const accessible = committees.filter((c) => user.isAdmin || user.ledCommitteeIds.includes(c.id));
  const selectedCommitteeId =
    committeeParam && accessible.some((c) => c.id === committeeParam) ? committeeParam : accessible[0]?.id;
  if (!selectedCommitteeId) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="تقييم الأداء" description={convoy.name} />
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">
            أنت لست قائداً لأي لجنة لتقييم الأداء.
          </CardContent>
        </Card>
      </div>
    );
  }

  const canWrite = user.isAdmin || markedLeaderIds.has(user.id);

  const { data: rosterVolunteers } = await supabase.from("volunteer_details").select("*");
  const memberRoster = ((rosterVolunteers ?? []) as RosterVolunteer[])
    .filter((v) => v.committees.some((c) => c.id === selectedCommitteeId) && v.profile_id !== null);

  const profileIds = memberRoster.map((v) => v.profile_id!);
  const { data: profilesData } = profileIds.length
    ? await supabase.rpc("get_profiles", { p_ids: profileIds })
    : { data: null };
  const members = ((profilesData ?? []) as Array<{ id: string; full_name: string; avatar_url: string | null; status: string }>)
    .filter((p) => p.status === "active");

  const [attendanceRes, evalsRes] = await Promise.all([
    supabase
      .from("convoy_attendance")
      .select("*")
      .eq("convoy_id", id)
      .eq("committee_id", selectedCommitteeId),
    supabase
      .from("convoy_evaluations")
      .select("*")
      .eq("convoy_id", id)
      .eq("committee_id", selectedCommitteeId),
  ]);

  // Only members marked present may be evaluated.
  const presentIds = new Set(
    (attendanceRes.data ?? []).filter((a) => a.status === "present").map((a) => a.volunteer_id),
  );
  const eligible = members.filter((m) => presentIds.has(m.id));

  const existing = new Map(
    (evalsRes.data ?? []).map((e) => [
      e.volunteer_id,
      { rating: e.rating as number, comment: e.comment as string | null },
    ]),
  );

  const isLocked = convoy.status === "completed" || convoy.status === "cancelled";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="تقييم الأداء"
        description={`${convoy.name} · ${convoyTypeLabels[convoy.type]} · ${formatDate(convoy.start_date)}`}
        action={
          <Link href={`/convoys/${id}`} className="inline-flex h-10 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowRight className="h-4 w-4" />
            التفاصيل
          </Link>
        }
      />

      {accessible.length > 1 && (
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
          {accessible.map((c) => (
            <Link
              key={c.id}
              href={`/convoys/${id}/evaluate?committee=${c.id}`}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                c.id === selectedCommitteeId
                  ? "bg-brand-700 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {isLocked ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm font-semibold text-slate-700">
              القافلة {convoy.status === "completed" ? "مكتملة" : "ملغاة"} — لا يمكن تعديل التقييمات.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              تم إغلاق باب التقييم لهذه القافلة.
            </p>
          </CardContent>
        </Card>
      ) : !canWrite ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm font-bold text-slate-800">
              لم يتم تحديدك كقائد حاضر لهذه القافلة
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              بعد أن يحدد مدير النظام القادة الحاضرين، يمكنك تقييم متطوعي لجنتك فقط.
            </p>
          </CardContent>
        </Card>
      ) : eligible.length === 0 ? (
        <EmptyState
          icon={Star}
          title="لا يوجد متطوعون مؤهلون للتقييم"
          description="سجّل حضور المتطوعين أولاً — فقط من حُدّدوا كحاضرين يمكن تقييمهم."
        />
      ) : (
        <EvaluationEditor
          convoyId={id}
          committeeId={selectedCommitteeId}
          members={eligible}
          existing={existing}
        />
      )}
    </div>
  );
}