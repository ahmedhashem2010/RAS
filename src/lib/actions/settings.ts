"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "./audit";
import type { ActionResult } from "./teams";

export interface AppSettings {
  warning_limit: number;
  leaderboard_visible_to_all: boolean;
}

const defaultSettings: AppSettings = {
  warning_limit: 3,
  leaderboard_visible_to_all: false,
};

function friendly(error: unknown, fallback: string): ActionResult {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  }
  console.error("[settings]", error);
  return { ok: false, error: fallback };
}

export async function getSettings(): Promise<AppSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  const result = { ...defaultSettings };
  for (const row of data ?? []) {
    if (row.key in result) {
      (result as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return result;
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.isSuperAdmin) return { ok: false, error: "صلاحية مدير النظام مطلوبة." };
  const supabase = await createClient();

  for (const [key, value] of Object.entries(patch)) {
    if (key === "warning_limit" && (typeof value !== "number" || value < 1 || value > 10)) {
      return { ok: false, error: "حد الإنذارات يجب أن يكون بين 1 و 10." };
    }
    const { error } = await supabase.from("app_settings").upsert(
      { key, value, updated_by: user.id },
      { onConflict: "key" },
    );
    if (error) return friendly(error, "حدث خطأ أثناء حفظ الإعدادات.");
  }

  await logAudit("settings_updated", "settings", null, { keys: Object.keys(patch) });
  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
