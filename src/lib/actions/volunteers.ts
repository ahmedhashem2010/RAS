"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "./audit";
import type { ActionResult } from "./teams";
import type { UserRole } from "@/lib/types";

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
    const { data: memberships } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("volunteer_id", id);
    const isLeader = (memberships ?? []).some((m) => user.ledTeamIds.includes(m.team_id));
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
