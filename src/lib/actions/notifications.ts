"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./teams";

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "غير مصرح" };

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);
  if (error) return { ok: false, error: "حدث خطأ أثناء تحديث الإشعارات." };

  revalidatePath("/notifications");
  return { ok: true };
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) return { ok: false, error: "حدث خطأ أثناء تحديث الإشعار." };
  revalidatePath("/notifications");
  return { ok: true };
}

export async function clearNotifications(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "غير مصرح" };

  const { error } = await supabase.from("notifications").delete().eq("user_id", user.id);
  if (error) return { ok: false, error: "حدث خطأ أثناء حذف الإشعارات." };
  revalidatePath("/notifications");
  return { ok: true };
}
