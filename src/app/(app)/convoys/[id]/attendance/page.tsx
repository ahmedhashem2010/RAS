import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCommitteeManager } from "@/lib/auth";
import { getAllCommitteesWithLeaders } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AttendanceEditor } from "@/components/convoys/attendance-editor";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { convoyTypeLabels } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import type { RosterVolunteer } from "@/lib/types";

export default async function ConvoyAttendancePage({
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

  // Accessible committees: admin → all; leader → committees they lead.
  const accessible = committees.filter((c) => user.isAdmin || user.ledCommitteeIds.includes(c.id));
  const selectedCommitteeId =
    committeeParam && accessible.some((c) => c.id === committeeParam) ? committeeParam : accessible[0]?.id;
  if (!selectedCommitteeId) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="تسجيل الحضور" description={convoy.name} />
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">
            أنت لست قائداً لأي لجنة لتسجيل الحضور.
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedCommittee = accessible.find((c) => c.id === selectedCommitteeId)!;
  const canWrite = user.isAdmin || markedLeaderIds.has(user.id);

  // Committee members (roster volunteers linked to a login account).
  const { data: rosterVolunteers } = await supabase.from("volunteer_details").select("*");
  const memberRoster = ((rosterVolunteers ?? []) as RosterVolunteer[])
    .filter((v) => v.committees.some((c) => c.id === selectedCommitteeId) && v.profile_id !== null);

  const profileIds = memberRoster.map((v) => v.profile_id!);
  const { data: profilesData } = profileIds.length
    ? await supabase.rpc("get_profiles", { p_ids: profileIds })
    : { data: null };
  const members = ((profilesData ?? []) as Array<{ id: string; full_name: string; avatar_url: string | null; status: string }>)
    .filter((p) => p.status === "active");

  const { data: attendanceRows } = await supabase
    .from("convoy_attendance")
    .select("*")
    .eq("convoy_id", id)
    .eq("committee_id", selectedCommitteeId);
  const existing = new Map(
    (attendanceRows ?? []).map((a) => [a.volunteer_id, a.status as "present" | "excused" | "absent"]),
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

      {/* Committee selector */}
      {accessible.length > 1 && (
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
          {accessible.map((c) => (
            <Link
              key={c.id}
              href={`/convoys/${id}/attendance?committee=${c.id}`}
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
              القافلة {convoy.status === "completed" ? "مكتملة" : "ملغاة"} — لا يمكن تعديل الحضور.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              يمكنك مراجعة الحضور المسجل من صفحة تفاصيل القافلة.
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
              مدير النظام يختار القادة الذين حضروا القافلة، وبعدها يمكنك تسجيل حضور
              متطوعي لجنتك فقط.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AttendanceEditor
          convoyId={id}
          committeeId={selectedCommitteeId}
          committeeName={selectedCommittee.name}
          members={members}
          initial={existing}
        />
      )}
    </div>
  );
}