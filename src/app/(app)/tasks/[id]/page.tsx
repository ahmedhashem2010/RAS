import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarClock, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { formatDate } from "@/lib/utils";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: task } = await supabase.from("tasks").select("*").eq("id", id).single();
  if (!task) notFound();

  const [teamRes, assignmentsRes, ledRes] = await Promise.all([
    supabase.from("teams").select("id, name").eq("id", task.team_id ?? "").maybeSingle(),
    supabase
      .from("task_assignments")
      .select("*")
      .eq("task_id", id)
      .order("created_at"),
    supabase.from("team_leaders").select("team_id").eq("leader_id", user.id),
  ]);

  const ledTeams = (ledRes.data ?? []).map((l) => l.team_id);
  const canManage = user.isAdmin || (task.team_id && ledTeams.includes(task.team_id));

  const assignmentRows = assignmentsRes.data ?? [];
  const profileIds = [
    ...new Set([
      task.created_by,
      ...assignmentRows.map((a) => a.volunteer_id),
      ...assignmentRows.map((a) => a.reviewed_by).filter(Boolean),
    ]),
  ].filter(Boolean);

  const { data: profilesData } = profileIds.length
    ? await supabase.rpc("get_profiles", { p_ids: profileIds })
    : { data: null };
  const profiles = (profilesData ?? []) as Array<{ id: string; full_name: string; avatar_url: string | null }>;
  const nameOf = (pid: string) =>
    (profiles.find((p) => p.id === pid) as { full_name?: string } | undefined)?.full_name ?? "متطوع";

  const assignments = assignmentRows.map((a) => ({
    ...a,
    volunteerName: nameOf(a.volunteer_id),
    reviewerName: a.reviewed_by ? nameOf(a.reviewed_by) : null,
    avatarUrl: (profiles.find((p) => p.id === a.volunteer_id) as { avatar_url?: string | null } | undefined)?.avatar_url ?? null,
  }));

  const myAssignment = assignments.find((a) => a.volunteer_id === user.id) ?? null;
  const teamName = (teamRes.data as { name?: string } | null)?.name ?? "فريق";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={task.title}
        description={`${teamName} · أنشأها ${nameOf(task.created_by)}`}
        action={
          <Link href="/tasks" className="inline-flex h-10 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowRight className="h-4 w-4" />
            كل المهام
          </Link>
        }
      />

      <Card className="mb-6">
        <CardContent className="space-y-3">
          {task.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {task.description}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Badge tone="teal">
              <Users className="h-3 w-3" />
              {teamName}
            </Badge>
            {task.deadline && (
              <Badge tone={new Date(task.deadline) < new Date() ? "red" : "blue"}>
                <CalendarClock className="h-3 w-3" />
                آخر موعد {formatDate(task.deadline)}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <TaskDetailPanel
        assignments={assignments}
        myAssignmentId={myAssignment?.id ?? null}
        myStatus={myAssignment?.status ?? null}
        myProofUrl={myAssignment?.proof_url ?? null}
        canManage={canManage}
      />
    </div>
  );
}
