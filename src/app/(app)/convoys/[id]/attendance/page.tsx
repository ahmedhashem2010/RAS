import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AttendanceEditor } from "@/components/convoys/attendance-editor";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { convoyTypeLabels } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

export default async function ConvoyAttendancePage({
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

  // Determine accessible teams: admin → all, leader → led teams
  let accessibleTeamIds: string[];
  if (user.isAdmin) {
    accessibleTeamIds = (teams ?? []).map((t) => t.id);
  } else {
    accessibleTeamIds = user.ledTeamIds;
  }

  const selectedTeamId = teamParam && accessibleTeamIds.includes(teamParam) ? teamParam : accessibleTeamIds[0];
  if (!selectedTeamId) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="تسجيل الحضور" description={convoy.name} />
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">
            أنت لست قائداً لأي فريق لتسجيل الحضور.
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedTeam = (teams ?? []).find((t) => t.id === selectedTeamId)!;

  const [membersRes, attendanceRes] = await Promise.all([
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
  ]);

  const members = (membersRes.data ?? [])
    .map((m) => m.profiles as unknown as { id: string; full_name: string; avatar_url: string | null; status: string })
    .filter((m) => m.status === "active");

  const existing = new Map(
    (attendanceRes.data ?? []).map((a) => [a.volunteer_id, a.status as "present" | "excused" | "absent"]),
  );

  const isLocked = convoy.status === "completed" || convoy.status === "cancelled";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="تسجيل الحضور"
        description={`${convoy.name} · ${convoyTypeLabels[convoy.type]} · ${formatDate(convoy.start_date)}`}
        action={
          <Link href={`/convoys/${id}`} className="inline-flex h-10 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowRight className="h-4 w-4" />
            التفاصيل
          </Link>
        }
      />

      {/* Team selector */}
      {accessibleTeamIds.length > 1 && (
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
          {(teams ?? [])
            .filter((t) => accessibleTeamIds.includes(t.id))
            .map((t) => (
              <Link
                key={t.id}
                href={`/convoys/${id}/attendance?team=${t.id}`}
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
              القافلة {convoy.status === "completed" ? "مكتملة" : "ملغاة"} — لا يمكن تعديل الحضور.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              يمكنك مراجعة الحضور المسجل من صفحة تفاصيل القافلة.
            </p>
          </CardContent>
        </Card>
      ) : selectedTeam.eval_mode === "media_work" ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm font-bold text-slate-800">
              فريق {selectedTeam.name} — الحضور غير مطلوب
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              فريق الوسائط يعمل عن بُعد، لذا لا يتم احتساب الحضور له. يمكنك تقييم
              أعمال الأعضاء المنتجة من القافلة من صفحة التقييم.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AttendanceEditor
          convoyId={id}
          teamId={selectedTeamId}
          teamName={selectedTeam.name}
          members={members}
          initial={existing}
        />
      )}
    </div>
  );
}
