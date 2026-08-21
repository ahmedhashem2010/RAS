"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "./audit";
import type { ActionResult } from "./teams";
import type { AwardType } from "@/lib/types";

function friendly(error: unknown, fallback: string): ActionResult {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  }
  console.error("[awards]", error);
  return { ok: false, error: fallback };
}

export interface CreateAwardInput {
  type: AwardType;
  recipientId: string;
  convoyId?: string | null;
  eventName?: string | null;
  date?: string;
  reason?: string | null;
}

export async function createAward(input: CreateAwardInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();

  if (input.date && isNaN(new Date(input.date).getTime())) {
    return { ok: false, error: "تاريخ الجائزة غير صحيح." };
  }

  const { error } = await supabase.from("awards").insert({
    type: input.type,
    recipient_id: input.recipientId,
    convoy_id: input.convoyId || null,
    event_name: input.eventName || null,
    award_date: input.date || new Date().toISOString().slice(0, 10),
    reason: input.reason?.trim() || null,
    given_by: user.id,
  });
  if (error) return friendly(error, "حدث خطأ أثناء إضافة الجائزة.");

  await logAudit("award_created", "award", input.recipientId, { type: input.type, by: user.id });
  revalidatePath("/awards");
  revalidatePath(`/volunteers/${input.recipientId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteAward(id: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();
  const { error } = await supabase.from("awards").delete().eq("id", id);
  if (error) return friendly(error, "حدث خطأ أثناء حذف الجائزة.");
  await logAudit("award_deleted", "award", id, { by: user.id });
  revalidatePath("/awards");
  revalidatePath("/dashboard");
  return { ok: true };
}
