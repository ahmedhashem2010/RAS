import Link from "next/link";
import {
  ClipboardList,
  CalendarClock,
  Plus,
  Users,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { taskStatusLabels } from "@/lib/i18n";
import type { TaskStatus } from "@/lib/types";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const user = await requireUser();
  const { team: teamFilter } = await searchParams;
  const supabase = await createClient();

  const { data: teams } = await supabase.from("teams").select("*").order("name");
  const canCreate = user.isAdmin || user.isTeamLeader;

  let tasks;
  let isVolunteerView = false;

  if (user.isAdmin) {
    let q = supabase.from("tasks").select("*").order("created_at", { ascending: false });
    if (teamFilter && teamFilter !== "all") q = q.eq("team_id", teamFilter);
    const { data } = await q;
    tasks = data ?? [];
  } else if (user.isTeamLeader) {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .in("team_id", user.ledTeamIds)
      .order("created_at", { ascending: false });
    tasks = data ?? [];
  } else {
    isVolunteerView = true;
    const { data } = await supabase
      .from("task_assignments")
      .select("task_id, status, submitted_at, tasks!inner(*, teams(name))")
      .eq("volunteer_id", user.id)
      .order("created_at", { ascending: false });
    tasks = (data ?? []).map((a) => ({
      ...(a.tasks as unknown as Record<string, unknown>),
      _myStatus: a.status,
      _mySubmittedAt: a.submitted_at,
    }));
  }

  // Assignment summary per task
  const assignmentSummary = new Map<
    string,
    { total: number; submitted: number; approved: number; pending: number }
  >();
  if (!isVolunteerView && tasks.length > 0) {
    const { data: assigns } = await supabase
      .from("task_assignments")
      .select("task_id, status, volunteer_id, profiles!task_assignments_volunteer_id_fkey(full_name, avatar_url)");
    for (const a of assigns ?? []) {
      const entry = assignmentSummary.get(a.task_id) ?? {
        total: 0,
        submitted: 0,
        approved: 0,
        pending: 0,
      };
      entry.total += 1;
      if (a.status === "submitted") entry.submitted += 1;
      if (a.status === "approved") entry.approved += 1;
      if (a.status === "pending" || a.status === "in_progress") entry.pending += 1;
      assignmentSummary.set(a.task_id, entry);
    }
  }

  const teamName = (tid: string | null) =>
    (teams ?? []).find((t) => t.id === tid)?.name ?? "";

  return (
    <div>
      <PageHeader
        title={isVolunteerView ? "مهامي" : "المهام"}
        description={
          isVolunteerView
            ? "تتبع وتسليم مهامك"
            : "إدارة المهام العادية للفرق — القوافل تُدار من صفحة القوافل"
        }
        action={
          canCreate ? (
            <Link href="/tasks/new">
              <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
                <Plus className="h-4 w-4" />
                مهمة جديدة
              </span>
            </Link>
          ) : undefined
        }
      />

      {user.isAdmin && (
        <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1">
          <Link
            href="/tasks?team=all"
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              !teamFilter || teamFilter === "all"
                ? "bg-brand-700 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            كل الفرق
          </Link>
          {(teams ?? []).map((t) => (
            <Link
              key={t.id}
              href={`/tasks?team=${t.id}`}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                teamFilter === t.id
                  ? "bg-brand-700 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={isVolunteerView ? "لا توجد مهام مكلفة لك" : "لا توجد مهام بعد"}
          description={
            isVolunteerView
              ? "عندما يكلفك قائد فريقك بمهمة ستظهر هنا."
              : "أنشئ مهمة جديدة لفريقك — تُعرض لكل أعضاء الفريق."
          }
          action={
            canCreate ? (
              <Link href="/tasks/new">
                <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
                  إنشاء مهمة
                </span>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => {
            const summary = isVolunteerView
              ? null
              : assignmentSummary.get(task.id);
            return (
              <Link key={task.id} href={`/tasks/${task.id}`}>
                <Card className="flex h-full flex-col transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
                  <CardContent className="flex flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-extrabold text-slate-900">
                        {task.title}
                      </h2>
                    </div>
                    {task.description && (
                      <p className="line-clamp-2 text-sm text-slate-500">
                        {task.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {teamName(task.team_id) && (
                        <Badge tone="teal">{teamName(task.team_id)}</Badge>
                      )}
                      {isVolunteerView ? (
                        <StatusBadge status={task._myStatus} />
                      ) : summary && (
                        <Badge tone={summary.submitted > 0 ? "amber" : "slate"}>
                          <Users className="h-3 w-3" />
                          {summary.approved}/{summary.total} مكتملة
                        </Badge>
                      )}
                    </div>
                    {isVolunteerView ? (
                      <div className="mt-auto flex items-center gap-2 text-xs text-slate-400">
                        <ClipboardList className="h-3.5 w-3.5" />
                        {taskStatusLabels[task._myStatus as TaskStatus]}
                        {task._mySubmittedAt && ` · سُلمت ${formatDate(task._mySubmittedAt)}`}
                      </div>
                    ) : (
                      <div className="mt-auto flex items-center gap-2 text-xs text-slate-400">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {task.deadline ? `آخر موعد ${formatDate(task.deadline)}` : "بدون موعد نهائي"}
                      </div>
                    )}
                    {summary && summary.submitted > 0 && (
                      <div className="mt-auto flex items-center gap-1 text-xs font-bold text-amber-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {summary.submitted} بانتظار المراجعة
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
