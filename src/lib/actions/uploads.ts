"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./result";

export async function uploadTaskProof(formData: FormData): Promise<ActionResult> {
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "لم يتم اختيار ملف." };
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "حجم الملف يجب ألا يتجاوز 10 ميجابايت." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "غير مصرح" };

  const ext = file.name.split(".").pop() ?? "bin";
  const path = `proofs/${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("task-proof")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) {
    console.error("[upload]", upErr);
    return { ok: false, error: "حدث خطأ أثناء رفع الملف." };
  }

  const { data } = supabase.storage.from("task-proof").getPublicUrl(path);
  return { ok: true, url: data.publicUrl } as ActionResult & { url: string };
}
