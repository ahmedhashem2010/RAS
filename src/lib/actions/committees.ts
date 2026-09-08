"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "./audit";
import type { ActionResult } from "./teams";
import { errors } from "@/lib/i18n";

function friendly(error: unknown, fallback: string): ActionResult {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return { ok: false, error: errors.notAuthorized };
  }
  console.error("[committees]", error);
  return { ok: false, error: fallback };
}

function notFoundOrDenied(): ActionResult {
  return { ok: false, error: "غير موجود أو لا تملك صلاحية القيام بهذا الإجراء." };
}

const revalidateCommittees = () => {
  revalidatePath("/committees");
  revalidatePath("/leaders");
  revalidatePath("/volunteers");
};

// ---------------------------------------------------------------
// Departments (committees) — super admin only at the DB boundary.
// ---------------------------------------------------------------

export async function createDepartment(input: {
  name: string;
  name_en: string;
  description?: string | null;
}): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };

  const name = input.name.trim();
  const nameEn = input.name_en.trim().replace(/\s+/g, "_").toLowerCase();
  if (name.length < 2) return { ok: false, error: "اسم اللجنة مطلوب." };
  if (!/^[a-z][a-z0-9_]*$/.test(nameEn)) {
    return { ok: false, error: "المعرف الإنجليزي يجب أن يبدأ بحرف ويحتوي أحرفاً وأرقاماً فقط." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .insert({ name, name_en: nameEn, description: input.description || null })
    .select("id")
    .single();
  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return { ok: false, error: "توجد لجنة بهذا الاسم أو المعرف بالفعل." };
    }
    return friendly(error, "حدث خطأ أثناء إضافة اللجنة.");
  }
  await logAudit("department_created", "department", data.id, { name, name_en: nameEn, by: user.id });
  revalidateCommittees();
  return { ok: true };
}

export async function updateDepartment(
  id: string,
  input: { name: string; description?: string | null; sort_order?: number },
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };
  if (input.name.trim().length < 2) return { ok: false, error: "اسم اللجنة مطلوب." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .update({
      name: input.name.trim(),
      description: input.description || null,
      sort_order: input.sort_order ?? 0,
    })
    .eq("id", id)
    .select("id");
  if (error) return friendly(error, "حدث خطأ أثناء تعديل اللجنة.");
  if (!data || data.length === 0) return notFoundOrDenied();

  await logAudit("department_updated", "department", id, { ...input, by: user.id });
  revalidateCommittees();
  return { ok: true };
}

export async function deleteDepartment(id: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("departments").delete().eq("id", id).select("id");
  if (error) return friendly(error, "حدث خطأ أثناء حذف اللجنة.");
  if (!data || data.length === 0) return notFoundOrDenied();
  await logAudit("department_deleted", "department", id, { by: user.id });
  revalidateCommittees();
  return { ok: true };
}

// ---------------------------------------------------------------
// Committee leadership — super admin only.
// ---------------------------------------------------------------

export async function setCommitteeLeader(
  committeeId: string,
  volunteerId: string,
  isDeputy: boolean,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };

  const supabase = await createClient();

  // Leadership implies membership: auto-add the volunteer to the committee
  // if they are not already a member.
  const { data: memberExists } = await supabase
    .from("committee_members")
    .select("volunteer_id")
    .eq("committee_id", committeeId)
    .eq("volunteer_id", volunteerId)
    .maybeSingle();
  if (!memberExists) {
    const { error: memberErr } = await supabase
      .from("committee_members")
      .insert({ committee_id: committeeId, volunteer_id: volunteerId });
    if (memberErr) return friendly(memberErr, "حدث خطأ أثناء إضافة العضوية.");
  }

  const { error: ledErr } = await supabase
    .from("committee_leaders")
    .insert({ committee_id: committeeId, leader_id: volunteerId, is_deputy: isDeputy, created_by: user.id });
  if (ledErr) {
    if (ledErr.message.toLowerCase().includes("duplicate")) {
      return { ok: false, error: "هذا الشخص مشغول بقيادة اللجنة بالفعل." };
    }
    return friendly(ledErr, "حدث خطأ أثناء تعيين القائد.");
  }

  await logAudit("committee_leader_set", "committee_leader", `${committeeId}:${volunteerId}`, {
    is_deputy: isDeputy,
    by: user.id,
  });
  revalidateCommittees();
  revalidatePath(`/committees/${committeeId}`);
  return { ok: true };
}

export async function removeCommitteeLeader(
  committeeId: string,
  volunteerId: string,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("committee_leaders")
    .delete()
    .eq("committee_id", committeeId)
    .eq("leader_id", volunteerId)
    .select("leader_id");
  if (error) return friendly(error, "حدث خطأ أثناء إزالة القائد.");
  if (!data || data.length === 0) return notFoundOrDenied();

  await logAudit("committee_leader_removed", "committee_leader", `${committeeId}:${volunteerId}`, {
    by: user.id,
  });
  revalidateCommittees();
  revalidatePath(`/committees/${committeeId}`);
  return { ok: true };
}