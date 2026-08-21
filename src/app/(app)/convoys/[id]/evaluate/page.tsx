import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EvaluationEditor } from "@/components/convoys/evaluation-editor";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRight, Star } from "lucide-react";
import Link from "next/link";
import { convoyTypeLabels } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

export default async function ConvoyEvaluatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ team?: string }>;
}) {
  const { id } = await params;
  const { team: teamParam } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: convoy } = await supabase
    .from("convoys")
    .select("*")
    .eq("id", id)
    .single();
  if (!convoy) notFound();

  const { data: teams } = await supabase.from("teams").select("*").order("name");

  const accessibleTeamIds = user.isAdmin
    ? (teams ?? []).map((t) => t.id)
    : user.ledTeamIds;

  const selectedTeamId = teamParam && accessibleTeamIds.includes(teamParam) ? teamParam : accessibleTeamIds[0];
  if (!selectedTeamId) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="تقييم الأداء" description={convoy.name} />
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">
            أنت لست قائداً لأي فريق لتقييم الأداء.
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedTeam = (teams ?? []).find((t) => t.id === selectedTeamId)!;

  const [membersRes, attendanceRes, evalsRes] = await Promise.all([
    supabase
      .from("team_members")
      .select("volunteer_id, profiles(id, full_name, avatar_url, status)")
      .eq("team_id", selectedTeamId)
      .order("joined_at"),
    supabase
      .from("convoy_attendance")
      .select("*")
      .eq("convoy_id", id)
      .eq("team_id", selectedTeamId),
    supabase
      .from("convoy_evaluations")
      .select("*")
      .eq("convoy_id", id)
      .eq("team_id", selectedTeamId),
  ]);

  const members = (membersRes.data ?? [])
    .map((m) => m.profiles as unknown as { id: string; full_name: string; avatar_url: string | null; status: string })
    .filter((m) => m.status === "active");

  const presentIds = new Set(
    (attendanceRes.data ?? [])
      .filter((a) => a.status === "present")
      .map((a) => a.volunteer_id),
  );

  // Media teams evaluate everyone; attendance teams only present volunteers.
  const eligible = selectedTeam.eval_mode === "media_work"
    ? members
    : members.filter((m) => presentIds.has(m.id));

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

      {accessibleTeamIds.length > 1 && (
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
          {(teams ?? [])
            .filter((t) => accessibleTeamIds.includes(t.id))
            .map((t) => (
              <Link
                key={t.id}
                href={`/convoys/${id}/evaluate?team=${t.id}`}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  t.id === selectedTeamId
                    ? "bg-brand-700 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {t.name}
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
      ) : eligible.length === 0 ? (
        <EmptyState
          icon={Star}
          title="لا يوجد متطوعون مؤهلون للتقييم"
          description={
            selectedTeam.eval_mode === "media_work"
              ? "لا يوجد أعضاء في هذا الفريق حالياً."
              : "سجّل حضور المتطوعين أولاً — فقط من حُدّدوا كحاضرين يمكن تقييمهم."
          }
        />
      ) : (
        <EvaluationEditor
          convoyId={id}
          teamId={selectedTeamId}
          members={eligible}
          existing={existing}
          mediaMode={selectedTeam.eval_mode === "media_work"}
        />
      )}
    </div>
  );
}
