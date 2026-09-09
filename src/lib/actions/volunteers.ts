"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "./audit";
import type { ActionResult } from "./result";
import type { UserRole, RosterVolunteer, VolunteerStatus } from "@/lib/types";

function friendly(error: unknown, fallback: string): ActionResult {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  }
  if (msg.includes("super admin status")) {
    return { ok: false, error: "لا يمكن تعديل حالة حساب مدير النظام." };
  }
  console.error("[volunteers]", error);
  return { ok: false, error: fallback };
}

/** RLS can silently filter an UPDATE to zero rows; treat that as a real failure. */
function notFoundOrDenied(): ActionResult {
  return { ok: false, error: "المتطوع غير موجود أو لا تملك صلاحية تعديل بياناته." };
}

export async function setVolunteerStatus(
  id: string,
  status: "active" | "banned",
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();

  // Role hierarchy: only a super admin may change a super admin's status.
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (!target) return notFoundOrDenied();
  if (target.role === "super_admin" && !user.isSuperAdmin) {
    return { ok: false, error: "لا يمكن تعديل حالة حساب مدير النظام." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) return friendly(error, "حدث خطأ أثناء تحديث حالة الحساب.");
  if (!data || data.length === 0) return notFoundOrDenied();
  await logAudit(status === "banned" ? "user_banned" : "user_unbanned", "profile", id);
  revalidatePath("/volunteers");
  revalidatePath(`/volunteers/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setVolunteerRole(id: string, role: UserRole): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", id)
    .select("id");
  if (error) return friendly(error, "حدث خطأ أثناء تحديث الدور.");
  if (!data || data.length === 0) return notFoundOrDenied();
  await logAudit("user_role_changed", "profile", id, { role });
  revalidatePath("/volunteers");
  revalidatePath(`/volunteers/${id}`);
  return { ok: true };
}

export async function updateVolunteerProfile(
  id: string,
  input: { full_name: string; phone?: string | null; age?: number | null; join_date?: string | null },
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };

  if (input.full_name.trim().length < 3) return { ok: false, error: "الاسم الكامل مطلوب." };
  if (input.age !== null && input.age !== undefined && (input.age < 10 || input.age > 120)) {
    return { ok: false, error: "العمر يجب أن يكون بين 10 و 120." };
  }

  const supabase = await createClient();
  if (!user.isAdmin) {
    // A committee leader may edit a profile that is a roster member of a
    // committee they lead.
    const { data: linked } = await supabase
      .from("volunteer_details")
      .select("profile_id, committees")
      .eq("profile_id", id);
    const isLeader = (linked ?? []).some((v) =>
      (v.committees as Array<{ id: string }>).some((c) => user.ledCommitteeIds.includes(c.id)),
    );
    if (!isLeader) return { ok: false, error: "صلاحية تعديل بيانات هذا المتطوع مطلوبة." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: input.full_name.trim(),
      phone: input.phone || null,
      age: input.age ?? null,
      join_date: input.join_date || null,
    })
    .eq("id", id)
    .select("id");
  if (error) return friendly(error, "حدث خطأ أثناء تعديل بيانات المتطوع.");
  if (!data || data.length === 0) return notFoundOrDenied();
  await logAudit("profile_updated", "profile", id, { ...input, by: user.id });
  revalidatePath(`/volunteers/${id}`);
  revalidatePath("/volunteers");
  revalidatePath("/dashboard");
  return { ok: true };
}

// --- Super admin: create users (uses the service role server-side) ---
export async function createUser(formData: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "volunteer") as UserRole;

  if (fullName.length < 3) return { ok: false, error: "الاسم الكامل مطلوب." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "بريد إلكتروني غير صحيح." };
  if (password.length < 6) return { ok: false, error: "كلمة المرور يجب ألا تقل عن 6 أحرف." };

  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      return { ok: false, error: "هذا البريد الإلكتروني مسجل بالفعل." };
    }
    return { ok: false, error: "حدث خطأ أثناء إنشاء المستخدم." };
  }

  if (role !== "volunteer") {
    await admin.from("profiles").update({ role }).eq("id", data.user.id);
  }

  await logAudit("user_created", "profile", data.user.id, { email, role, by: me.id });
  revalidatePath("/admin/users");
  revalidatePath("/volunteers");
  return { ok: true };
}

// ---------------------------------------------------------------
// Volunteers Management System — committee roster
// Permissions are re-checked server-side on every action and again in
// the database (RLS + guard triggers). The UI only hides buttons.
// ---------------------------------------------------------------

const revalidateRoster = () => {
  revalidatePath("/volunteers");
  revalidatePath("/leaders");
  revalidatePath("/committees");
};

async function getRosterVolunteer(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("volunteer_details")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as RosterVolunteer | null) ?? null;
}

export async function createRosterVolunteer(input: {
  full_name: string;
  phone?: string | null;
  notes?: string | null;
  committee_ids: string[];
}): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية الإدارة مطلوبة." };

  const fullName = input.full_name.trim();
  if (fullName.length < 3) return { ok: false, error: "الاسم الكامل مطلوب." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("volunteers")
    .insert({ full_name: fullName, phone: input.phone || null, notes: input.notes || null })
    .select("id")
    .single();
  if (error) return friendly(error, "حدث خطأ أثناء إضافة المتطوع.");

  const volunteerId = data.id;
  if (input.committee_ids.length > 0) {
    const { error: memberErr } = await supabase.from("committee_members").insert(
      input.committee_ids.map((committee_id) => ({ committee_id, volunteer_id: volunteerId })),
    );
    if (memberErr) {
      await supabase.from("volunteers").delete().eq("id", volunteerId);
      return friendly(memberErr, "حدث خطأ أثناء تعيين اللجان.");
    }
  }

  await logAudit("volunteer_created", "volunteer", volunteerId, {
    name: fullName,
    committees: input.committee_ids,
    by: user.id,
  });
  revalidateRoster();
  return { ok: true };
}

export async function updateRosterVolunteer(
  id: string,
  input: { full_name: string; phone?: string | null; notes?: string | null },
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };

  const fullName = input.full_name.trim();
  if (fullName.length < 3) return { ok: false, error: "الاسم الكامل مطلوب." };

  const volunteer = await getRosterVolunteer(id);
  if (!volunteer) return notFoundOrDenied();

  // Committee leaders/deputies may edit members of committees they lead.
  if (!user.isAdmin) {
    const leads = volunteer.committees.some((c) => user.ledCommitteeIds.includes(c.id));
    if (!leads) return { ok: false, error: "صلاحية تعديل بيانات هذا المتطوع مطلوبة." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("volunteers")
    .update({ full_name: fullName, phone: input.phone || null, notes: input.notes || null })
    .eq("id", id)
    .select("id");
  if (error) return friendly(error, "حدث خطأ أثناء تعديل بيانات المتطوع.");
  if (!data || data.length === 0) return notFoundOrDenied();

  await logAudit("volunteer_updated", "volunteer", id, { ...input, by: user.id });
  revalidateRoster();
  revalidatePath(`/volunteers/v/${id}`);
  return { ok: true };
}

export async function setRosterStatus(
  id: string,
  status: VolunteerStatus,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية الإدارة مطلوبة." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("volunteers")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) return friendly(error, "حدث خطأ أثناء تحديث حالة المتطوع.");
  if (!data || data.length === 0) return notFoundOrDenied();
  await logAudit("volunteer_status_changed", "volunteer", id, { status, by: user.id });
  revalidateRoster();
  revalidatePath(`/volunteers/v/${id}`);
  return { ok: true };
}

/**
 * Standing assessment (rating 1-5 + description + notes) on a roster
 * volunteer's record. Admins only — independent of any convoy and
 * editable anytime. Leaders may NOT touch these fields (guard
 * trigger + server check + RLS all enforce it).
 */
export async function updateVolunteerAssessment(
  id: string,
  input: { rating: number | null; description?: string | null; notes?: string | null },
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية الإدارة مطلوبة." };
  if (input.rating !== null && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
    return { ok: false, error: "التقييم يجب أن يكون من 1 إلى 5 أو بدون تقييم." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("volunteers")
    .update({
      rating: input.rating,
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .eq("id", id)
    .select("id");
  if (error) return friendly(error, "حدث خطأ أثناء حفظ التقييم العام.");
  if (!data || data.length === 0) return notFoundOrDenied();
  await logAudit("volunteer_rating_updated", "volunteer", id, {
    rating: input.rating,
    has_description: Boolean(input.description?.trim()),
    by: user.id,
  });
  revalidateRoster();
  revalidatePath(`/volunteers/v/${id}`);
  return { ok: true };
}

export async function deleteRosterVolunteer(id: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("volunteers").delete().eq("id", id).select("id");
  if (error) return friendly(error, "حدث خطأ أثناء حذف المتطوع.");
  if (!data || data.length === 0) return notFoundOrDenied();
  await logAudit("volunteer_deleted", "volunteer", id, { by: user.id });
  revalidateRoster();
  return { ok: true };
}

export async function assignVolunteerCommittees(
  id: string,
  committeeIds: string[],
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية الإدارة مطلوبة." };
  const volunteer = await getRosterVolunteer(id);
  if (!volunteer) return notFoundOrDenied();

  const current = new Set(volunteer.committees.map((c) => c.id));
  const toAdd = committeeIds.filter((c) => !current.has(c));
  const toRemove = [...current].filter((c) => !committeeIds.includes(c));

  const supabase = await createClient();
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("committee_members")
      .delete()
      .eq("volunteer_id", id)
      .in("committee_id", toRemove);
    if (error) return friendly(error, "حدث خطأ أثناء تحديث اللجان.");
  }
  if (toAdd.length > 0) {
    const { error } = await supabase.from("committee_members").insert(
      toAdd.map((committee_id) => ({ committee_id, volunteer_id: id })),
    );
    if (error) return friendly(error, "حدث خطأ أثناء تحديث اللجان.");
  }

  await logAudit("volunteer_updated", "volunteer", id, {
    committees: committeeIds,
    by: user.id,
  });
  revalidateRoster();
  revalidatePath(`/volunteers/v/${id}`);
  return { ok: true };
}

export async function linkVolunteerProfile(
  id: string,
  profileId: string | null,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("volunteers")
    .update({ profile_id: profileId })
    .eq("id", id)
    .select("id");
  if (error) return friendly(error, "حدث خطأ أثناء ربط الحساب.");
  if (!data || data.length === 0) return notFoundOrDenied();
  await logAudit("volunteer_profile_linked", "volunteer", id, {
    profile_id: profileId,
    by: user.id,
  });
  revalidateRoster();
  revalidatePath(`/volunteers/v/${id}`);
  return { ok: true };
}
