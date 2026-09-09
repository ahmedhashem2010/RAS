"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "./audit";
import type { ActionResult } from "./result";
import type { AttendanceStatus, ConvoyStatus } from "@/lib/types";

const CONVOY_DURATION: Record<string, number> = {
  normal: 1,
  mini_camp: 2,
  full_camp: 3,
};

function friendly(error: unknown, fallback: string): ActionResult {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  }
  if (msg.includes("must be marked present")) {
    return { ok: false, error: "لا يمكن تقييم متطوع غير مسجل كحاضر." };
  }
  console.error("[convoys]", error);
  return { ok: false, error: fallback };
}

export async function createConvoy(formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };
  if (!user.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "normal");
  const location = String(formData.get("location") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const instructions = String(formData.get("instructions") ?? "").trim() || null;
  const rawStart = String(formData.get("startDate") ?? "");

  if (name.length < 3) return { ok: false, error: "اسم القافلة مطلوب." };
  if (!rawStart) return { ok: false, error: "تاريخ بدء القافلة مطلوب." };

  const startDate = new Date(rawStart);
  if (isNaN(startDate.getTime())) return { ok: false, error: "تاريخ غير صحيح." };

  const duration = CONVOY_DURATION[type] ?? 1;
  const end = new Date(startDate);
  end.setDate(end.getDate() + duration - 1);
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("convoys")
    .insert({
      name,
      type,
      location,
      description,
      instructions,
      start_date: start,
      end_date: endDate,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return friendly(error, "حدث خطأ أثناء إنشاء القافلة.");

  await logAudit("convoy_created", "convoy", data.id, { type, by: user.id });
  revalidatePath("/convoys");
  revalidatePath("/dashboard");
  return { ok: true, id: data.id } as ActionResult & { id: string };
}

export async function updateConvoy(id: string, formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  const fields = ["name", "type", "location", "description", "instructions", "status"] as const;
  for (const f of fields) {
    const v = formData.get(f);
    if (v !== null) patch[f] = f === "description" || f === "instructions" || f === "location" ? String(v).trim() || null : String(v);
  }

  const { error } = await supabase.from("convoys").update(patch).eq("id", id);
  if (error) return friendly(error, "حدث خطأ أثناء تعديل القافلة.");

  await logAudit("convoy_updated", "convoy", id, { by: user.id });
  revalidatePath("/convoys");
  revalidatePath(`/convoys/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setConvoyStatus(id: string, status: ConvoyStatus): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();
  const { error } = await supabase.from("convoys").update({ status }).eq("id", id);
  if (error) return friendly(error, "حدث خطأ أثناء تحديث حالة القافلة.");
  await logAudit("convoy_status_changed", "convoy", id, { status, by: user.id });
  revalidatePath("/convoys");
  revalidatePath(`/convoys/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteConvoy(id: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();
  const { error } = await supabase.from("convoys").delete().eq("id", id);
  if (error) return friendly(error, "حدث خطأ أثناء حذف القافلة.");
  await logAudit("convoy_deleted", "convoy", id, { by: user.id });
  revalidatePath("/convoys");
  revalidatePath("/dashboard");
  return { ok: true };
}

export interface AttendanceRecord {
  volunteerId: string;
  status: AttendanceStatus;
}

/**
 * Super admin chooses which committee leaders attended the convoy.
 * Only marked leaders may later record attendance/ratings for their
 * own committees (enforced again in the database).
 */
export async function setConvoyLeaders(
  convoyId: string,
  leaderIds: string[],
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("convoy_leaders")
    .select("leader_id")
    .eq("convoy_id", convoyId);
  const current = new Set((existing ?? []).map((r) => r.leader_id));
  const next = new Set(leaderIds);
  const toAdd = [...next].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !next.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("convoy_leaders")
      .delete()
      .eq("convoy_id", convoyId)
      .in("leader_id", toRemove);
    if (error) return friendly(error, "حدث خطأ أثناء تحديث قادة القافلة.");
  }
  if (toAdd.length > 0) {
    const { error } = await supabase.from("convoy_leaders").insert(
      toAdd.map((leader_id) => ({ convoy_id: convoyId, leader_id, marked_by: user.id })),
    );
    if (error) return friendly(error, "حدث خطأ أثناء تحديث قادة القافلة.");
  }

  await logAudit("convoy_leaders_updated", "convoy", convoyId, {
    leaders: [...next],
    by: user.id,
  });
  revalidatePath(`/convoys/${convoyId}`);
  revalidatePath(`/convoys/${convoyId}/attendance`);
  revalidatePath(`/convoys/${convoyId}/evaluate`);
  return { ok: true };
}

export async function saveAttendance(
  convoyId: string,
  committeeId: string,
  records: AttendanceRecord[],
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };

  const supabase = await createClient();
  const { error: delErr } = await supabase
    .from("convoy_attendance")
    .delete()
    .eq("convoy_id", convoyId)
    .eq("committee_id", committeeId);

  if (delErr) return friendly(delErr, "حدث خطأ أثناء تحديث الحضور.");

  const rows = records.map((r) => ({
    convoy_id: convoyId,
    committee_id: committeeId,
    volunteer_id: r.volunteerId,
    status: r.status,
    marked_by: user.id,
  }));

  const { error } = await supabase.from("convoy_attendance").insert(rows);
  if (error) return friendly(error, "حدث خطأ أثناء حفظ الحضور.");

  await logAudit("attendance_changed", "convoy", convoyId, {
    committee_id: committeeId,
    count: records.length,
    by: user.id,
  });
  revalidatePath(`/convoys/${convoyId}`);
  revalidatePath(`/convoys/${convoyId}/attendance`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function saveEvaluation(
  convoyId: string,
  committeeId: string,
  volunteerId: string,
  rating: number,
  comment: string | null,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "يجب أن يكون التقييم من 1 إلى 5." };
  }

  const supabase = await createClient();

  // Determine whether this is an insert (rating once per volunteer per committee per convoy)
  const { data: existing } = await supabase
    .from("convoy_evaluations")
    .select("id")
    .eq("convoy_id", convoyId)
    .eq("committee_id", committeeId)
    .eq("volunteer_id", volunteerId)
    .maybeSingle();

  let error;
  if (existing) {
    ({ error } = await supabase
      .from("convoy_evaluations")
      .update({ rating, comment, leader_id: user.id })
      .eq("id", existing.id));
  } else {
    ({ error } = await supabase
      .from("convoy_evaluations")
      .insert({ convoy_id: convoyId, committee_id: committeeId, volunteer_id: volunteerId, rating, comment, leader_id: user.id }));
  }

  if (error) return friendly(error, "حدث خطأ أثناء حفظ التقييم. حاول مرة أخرى.");

  await logAudit(existing ? "rating_updated" : "rating_created", "convoy", convoyId, {
    committee_id: committeeId,
    volunteer_id: volunteerId,
    rating,
    by: user.id,
  });
  revalidatePath(`/convoys/${convoyId}`);
  revalidatePath(`/convoys/${convoyId}/evaluate`);
  revalidatePath("/dashboard");
  return { ok: true };
}
