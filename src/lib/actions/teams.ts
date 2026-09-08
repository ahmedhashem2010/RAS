"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser, type AuthedUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "./audit";

export type ActionResult = { ok: boolean; error?: string };

function friendly(error: unknown, fallback: string): ActionResult {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("cannot lead more than one team")) {
    return { ok: false, error: "لا يمكن تعيين الشخص قائداً لمجموعتين مختلفتين." };
  }
  if (msg.includes("duplicate key")) {
    return { ok: false, error: "سجل مكرر — تأكد من عدم التكرار." };
  }
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  }
  if (msg.includes("cannot remove an admin")) {
    return { ok: false, error: "لا يمكن لقائد المجموعة إزالة مدير." };
  }
  if (msg.includes("at least one leader")) {
    return { ok: false, error: "يجب أن يبقى قائد واحد على الأقل في المجموعة." };
  }
  console.error("[teams]", error);
  return { ok: false, error: fallback };
}

/**
 * Team-scoped management permission:
 * - General/Super Admin: every team.
 * - Team leader/co-leader: only teams they lead.
 */
function canManageTeam(user: AuthedUser, teamId: string): boolean {
  return user.isAdmin || user.ledTeamIds.includes(teamId);
}

export async function createTeam(formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "#0d9488");
  const evalMode = String(formData.get("evalMode") ?? "attendance");

  if (name.length < 2) return { ok: false, error: "اسم المجموعة مطلوب." };

  const { data, error } = await supabase
    .from("teams")
    .insert({ name, description, color, eval_mode: evalMode })
    .select("id")
    .single();
  if (error) return friendly(error, "حدث خطأ أثناء إنشاء المجموعة.");

  await logAudit("team_created", "team", data.id, { by: user.id });
  revalidatePath("/teams");
  revalidatePath("/dashboard");
  return { ok: true, id: data.id } as ActionResult & { id: string };
}

export async function updateTeam(id: string, formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "#0d9488");
  const evalMode = String(formData.get("evalMode") ?? "attendance");

  const { error } = await supabase
    .from("teams")
    .update({ name, description, color, eval_mode: evalMode })
    .eq("id", id);
  if (error) return friendly(error, "حدث خطأ أثناء تعديل المجموعة.");

  await logAudit("team_updated", "team", id, { by: user.id });
  revalidatePath("/teams");
  revalidatePath(`/teams/${id}`);
  return { ok: true };
}

export async function deleteTeam(id: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) return friendly(error, "حدث خطأ أثناء حذف المجموعة.");
  await logAudit("team_deleted", "team", id, { by: user.id });
  revalidatePath("/teams");
  return { ok: true };
}

export async function addMember(teamId: string, volunteerId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "يجب تسجيل الدخول." };
  if (!canManageTeam(user, teamId)) return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .insert({ team_id: teamId, volunteer_id: volunteerId });
  if (error) return friendly(error, "حدث خطأ أثناء إضافة العضو.");
  await logAudit("member_added", "team", teamId, { volunteer_id: volunteerId, by: user.id });
  revalidatePath(`/teams/${teamId}`);
  return { ok: true };
}

export async function removeMember(teamId: string, volunteerId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "يجب تسجيل الدخول." };
  if (!canManageTeam(user, teamId)) return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("volunteer_id", volunteerId);
  if (error) return friendly(error, "حدث خطأ أثناء إزالة العضو.");
  await logAudit("member_removed", "team", teamId, { volunteer_id: volunteerId, by: user.id });
  revalidatePath(`/teams/${teamId}`);
  return { ok: true };
}

export async function assignLeader(teamId: string, leaderId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "يجب تسجيل الدخول." };
  if (!canManageTeam(user, teamId)) return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  const supabase = await createClient();

  // A leader/co-leader may only promote a current member of their own team.
  if (!user.isAdmin) {
    const { data: member } = await supabase
      .from("team_members")
      .select("volunteer_id")
      .eq("team_id", teamId)
      .eq("volunteer_id", leaderId)
      .maybeSingle();
    if (!member) return { ok: false, error: "يمكن تعيين عضو من المجموعة فقط كقائد." };
  }

  const { error } = await supabase
    .from("team_leaders")
    .insert({ team_id: teamId, leader_id: leaderId });
  if (error) return friendly(error, "حدث خطأ أثناء تعيين القائد.");
  await logAudit("leader_assigned", "team", teamId, { leader_id: leaderId, by: user.id });
  revalidatePath(`/teams/${teamId}`);
  revalidatePath("/teams");
  return { ok: true };
}

export async function removeLeader(teamId: string, leaderId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "يجب تسجيل الدخول." };
  if (!canManageTeam(user, teamId)) return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  const supabase = await createClient();

  // Role hierarchy: a plain team leader must not remove an admin (general/super).
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", leaderId)
    .maybeSingle();
  if (!target) return { ok: false, error: "القائد غير موجود." };
  if (!user.isAdmin && (target.role === "general_admin" || target.role === "super_admin")) {
    return { ok: false, error: "لا يمكن لقائد المجموعة إزالة مدير." };
  }

  // A leader removing themselves must not leave the team without any leader.
  if (user.id === leaderId) {
    const { data: others } = await supabase
      .from("team_leaders")
      .select("leader_id")
      .eq("team_id", teamId)
      .neq("leader_id", user.id);
    if ((others ?? []).length === 0) {
      return { ok: false, error: "يجب أن يبقى قائد واحد على الأقل في المجموعة." };
    }
  }

  const { error } = await supabase
    .from("team_leaders")
    .delete()
    .eq("team_id", teamId)
    .eq("leader_id", leaderId);
  if (error) return friendly(error, "حدث خطأ أثناء إزالة القائد.");
  await logAudit("leader_removed", "team", teamId, { leader_id: leaderId, by: user.id });
  revalidatePath(`/teams/${teamId}`);
  revalidatePath("/teams");
  return { ok: true };
}

/**
 * A volunteer removes only their own membership from a team.
 * RLS (member_leave_self) enforces `volunteer_id = auth.uid()` at the DB level.
 */
export async function leaveTeam(teamId: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "يجب تسجيل الدخول." };
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("team_members")
    .select("volunteer_id")
    .eq("team_id", teamId)
    .eq("volunteer_id", user.id)
    .maybeSingle();
  if (!member) return { ok: false, error: "أنت لست عضواً في هذه المجموعة." };

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("volunteer_id", user.id);
  if (error) return friendly(error, "حدث خطأ أثناء مغادرة المجموعة.");

  await logAudit("member_left_team", "team", teamId, { by: user.id });
  revalidatePath(`/teams/${teamId}`);
  revalidatePath("/teams");
  revalidatePath("/dashboard");
  return { ok: true };
}
