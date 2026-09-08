"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "./audit";
import type { ActionResult } from "./teams";

function friendly(error: unknown, fallback: string): ActionResult {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  }
  if (msg.includes("not a member of the task team")) {
return { ok: false, error: "يمكن تعيين عضو من المجموعة فقط." };
  }
  if (msg.includes("non-active volunteer") || msg.includes("does not exist")) {
    return { ok: false, error: "لا يمكن تعيين حساب موقوف أو غير نشط." };
  }
  if (msg.includes("Only a leader of the task team")) {
    return { ok: false, error: "صلاحية إنشاء مهمة لهذه المجموعة مطلوبة." };
  }
  console.error("[tasks]", error);
  return { ok: false, error: fallback };
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  teamId: string;
  deadline?: string;
  assignTo?: "all" | string;
}

export async function createTask(input: CreateTaskInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };
  const supabase = await createClient();

  const title = input.title.trim();
  if (title.length < 3) return { ok: false, error: "عنوان المهمة مطلوب." };
  if (input.deadline && isNaN(new Date(input.deadline).getTime())) {
    return { ok: false, error: "الموعد النهائي غير صحيح." };
  }
  if (!user.isAdmin && !(input.teamId && user.ledTeamIds.includes(input.teamId))) {
    return { ok: false, error: "صلاحية إنشاء مهمة لهذه المجموعة مطلوبة." };
  }

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert({
      title,
      description: input.description?.trim() || null,
      team_id: input.teamId,
      deadline: input.deadline || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (taskErr) return friendly(taskErr, "حدث خطأ أثناء إنشاء المهمة.");

  let volunteerIds: string[] = [];
  if (input.assignTo && input.assignTo !== "all") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.assignTo)) {
      return { ok: false, error: "المتطوع غير صحيح." };
    }
    const { data: target } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", input.assignTo)
      .maybeSingle();
    if (!target) return { ok: false, error: "المتطوع غير موجود." };
    if (target.status !== "active") {
      return { ok: false, error: "لا يمكن تعيين حساب موقوف أو غير نشط." };
    }
    // Leaders may only assign members of their own team.
    if (!user.isAdmin) {
      const { data: member } = await supabase
        .from("team_members")
        .select("volunteer_id")
        .eq("team_id", input.teamId)
        .eq("volunteer_id", input.assignTo)
        .maybeSingle();
      if (!member) return { ok: false, error: "يمكن تعيين عضو من المجموعة فقط." };
    }
    volunteerIds = [input.assignTo];
  } else {
    const { data: members } = await supabase
      .from("team_members")
      .select("volunteer_id")
      .eq("team_id", input.teamId);
    const memberIds = (members ?? []).map((m) => m.volunteer_id);
    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, status")
        .in("id", memberIds);
      volunteerIds = (profiles ?? [])
        .filter((p) => p.status === "active")
        .map((p) => p.id);
    }
  }

  if (volunteerIds.length > 0) {
    const { error: assignErr } = await supabase.from("task_assignments").insert(
      volunteerIds.map((volunteerId) => ({
        task_id: task.id,
        volunteer_id: volunteerId,
      })),
    );
    if (assignErr) return friendly(assignErr, "حدث خطأ أثناء تعيين المهمة.");
  }
  await logAudit("task_created", "task", task.id, { title });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath(`/teams/${input.teamId}`);
  return { ok: true, id: task.id } as ActionResult & { id: string };
}

export async function updateTask(
  id: string,
  input: { title?: string; description?: string; deadline?: string | null },
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };
  const supabase = await createClient();
  if (!(await canManageTask(supabase, user, id))) {
    return { ok: false, error: "صلاحية تعديل هذه المهمة مطلوبة." };
  }
  const { error } = await supabase
    .from("tasks")
    .update({
      title: input.title,
      description: input.description?.trim() || null,
      deadline: input.deadline || null,
    })
    .eq("id", id);
  if (error) return friendly(error, "حدث خطأ أثناء تعديل المهمة.");
  await logAudit("task_updated", "task", id, { title: input.title });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };
  const supabase = await createClient();
  if (!(await canManageTask(supabase, user, id))) {
    return { ok: false, error: "صلاحية حذف هذه المهمة مطلوبة." };
  }
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return friendly(error, "حدث خطأ أثناء حذف المهمة.");
  await logAudit("task_deleted", "task", id);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

async function canManageTask(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { isAdmin: boolean; ledTeamIds: string[] },
  taskId: string,
): Promise<boolean> {
  if (user.isAdmin) return true;
  const { data } = await supabase
    .from("tasks")
    .select("team_id")
    .eq("id", taskId)
    .maybeSingle();
  return Boolean(data?.team_id && user.ledTeamIds.includes(data.team_id));
}

export async function startTask(assignmentId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("task_assignments")
    .select("status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { ok: false, error: "المهمة غير موجودة." };
  if (assignment.status !== "pending") {
    return { ok: false, error: "لا يمكن بدء مهمة غير معلّقة." };
  }

  const { error } = await supabase
    .from("task_assignments")
    .update({ status: "in_progress" })
    .eq("id", assignmentId);
  if (error) return friendly(error, "حدث خطأ أثناء تحديث المهمة.");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function submitTask(assignmentId: string, proofUrl?: string | null): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("task_assignments")
    .select("status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { ok: false, error: "المهمة غير موجودة." };
  if (!["pending", "in_progress", "rejected"].includes(assignment.status)) {
    return { ok: false, error: "لا يمكن تسليم مهمة في هذه الحالة." };
  }

  const { error } = await supabase
    .from("task_assignments")
    .update({ status: "submitted", proof_url: proofUrl || null, submitted_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (error) return friendly(error, "حدث خطأ أثناء تسليم المهمة.");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function reviewTask(
  assignmentId: string,
  approve: boolean,
  rating: number | null,
  comment?: string | null,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };
  if (approve && (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5)) {
    return { ok: false, error: "يرجى تقييم المهمة المقبولة من 1 إلى 5." };
  }

  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("task_assignments")
    .select("status, task_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { ok: false, error: "المهمة غير موجودة." };

  const { data: task } = await supabase.from("tasks").select("team_id").eq("id", assignment.task_id).maybeSingle();
  const canReview = user.isAdmin || (task?.team_id && user.ledTeamIds.includes(task.team_id));
  if (!canReview) return { ok: false, error: "صلاحية مراجعة هذه المهمة مطلوبة." };
  if (assignment.status !== "submitted") {
    return { ok: false, error: "لا يمكن مراجعة مهمة غير مسلّمة." };
  }

  const { error } = await supabase
    .from("task_assignments")
    .update({
      status: approve ? "approved" : "rejected",
      rating: approve ? rating : null,
      review_comment: comment?.trim() || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", assignmentId);
  if (error) return friendly(error, "حدث خطأ أثناء مراجعة المهمة.");
  await logAudit(approve ? "task_reviewed" : "task_rejected", "task_assignment", assignmentId, { rating });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function reopenTask(assignmentId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("task_assignments")
    .select("status, task_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { ok: false, error: "المهمة غير موجودة." };
  const { data: task } = await supabase.from("tasks").select("team_id").eq("id", assignment.task_id).maybeSingle();
  const canReopen = user.isAdmin || (task?.team_id && user.ledTeamIds.includes(task.team_id));
  if (!canReopen) return { ok: false, error: "صلاحية إعادة فتح هذه المهمة مطلوبة." };
  if (assignment.status !== "rejected") {
    return { ok: false, error: "لا يمكن إعادة فتح مهمة غير مرفوضة." };
  }

  const { error } = await supabase
    .from("task_assignments")
    .update({ status: "pending", review_comment: null })
    .eq("id", assignmentId);
  if (error) return friendly(error, "حدث خطأ أثناء إعادة فتح المهمة.");
  await logAudit("task_reopened", "task_assignment", assignmentId);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}
