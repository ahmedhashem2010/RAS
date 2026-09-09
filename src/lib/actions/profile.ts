"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./result";

function friendly(error: unknown, fallback: string): ActionResult {
  const msg = error instanceof Error ? error.message : "";
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return { ok: false, error: "ليس لديك صلاحية للقيام بهذا الإجراء." };
  }
  console.error("[profile]", error);
  return { ok: false, error: fallback };
}

export async function updateOwnProfile(
  input: {
    full_name: string;
    phone?: string | null;
    age?: number | null;
  },
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };

  if (input.full_name.trim().length < 3) return { ok: false, error: "الاسم الكامل مطلوب." };
  if (input.age !== null && input.age !== undefined && (input.age < 10 || input.age > 120)) {
    return { ok: false, error: "العمر يجب أن يكون بين 10 و 120." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.full_name.trim(),
      phone: input.phone || null,
      age: input.age ?? null,
    })
    .eq("id", user.id);
  if (error) return friendly(error, "حدث خطأ أثناء حفظ البيانات.");

  revalidatePath("/profile");
  return { ok: true };
}

export async function uploadAvatar(formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "غير مصرح" };

  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "لم يتم اختيار ملف." };

  if (!file.type.startsWith("image/")) return { ok: false, error: "يرجى اختيار صورة." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "حجم الصورة يجب ألا يتجاوز 2 ميجابايت." };

  const supabase = await createClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `avatars/${user.id}-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return friendly(upErr, "حدث خطأ أثناء رفع الصورة.");

  const { data: url } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url.publicUrl })
    .eq("id", user.id);
  if (error) return friendly(error, "حدث خطأ أثناء حفظ الصورة.");

  revalidatePath("/profile");
  return { ok: true, url: url.publicUrl } as ActionResult & { url: string };
}
