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
  console.error("[warnings]", error);
  return { ok: false, error: fallback };
}

export interface IssueWarningInput {
  volunteerId: string;
  reason: string;
  convoyId?: string | null;
  taskId?: string | null;
}

export async function issueWarning(input: IssueWarningInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "سبب الإنذار مطلوب ولا يمكن أن يكون فارغاً." };

  const { data: volunteer } = await supabase
    .from("profiles")
    .select("id, status")
    .eq("id", input.volunteerId)
    .maybeSingle();
  if (!volunteer) return { ok: false, error: "المتطوع غير موجود." };

  const { count } = await supabase
    .from("warnings")
    .select("*", { count: "exact", head: true })
    .eq("volunteer_id", input.volunteerId);
  const number = (count ?? 0) + 1;

  const { error } = await supabase.from("warnings").insert({
    volunteer_id: input.volunteerId,
    number,
    reason,
    convoy_id: input.convoyId || null,
    task_id: input.taskId || null,
    issued_by: user.id,
  });
  if (error) return friendly(error, "حدث خطأ أثناء إصدار الإنذار.");

  await logAudit("warning_issued", "warning", input.volunteerId, { number, reason: reason.slice(0, 120) });
  revalidatePath("/warnings");
  revalidatePath(`/volunteers/${input.volunteerId}`);
  revalidatePath("/dashboard");
  return { ok: true, number } as ActionResult & { number: number };
}

export async function deleteWarning(id: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "صلاحية المدير مطلوبة." };
  const supabase = await createClient();
  const { error } = await supabase.from("warnings").delete().eq("id", id);
  if (error) return friendly(error, "حدث خطأ أثناء حذف الإنذار.");
  await logAudit("warning_deleted", "warning", id, { by: user.id });
  revalidatePath("/warnings");
  revalidatePath("/dashboard");
  return { ok: true };
}
