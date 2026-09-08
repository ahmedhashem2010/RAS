"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type ActionResult = { error?: string; ok: boolean };

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { ok: false, error: "يرجى إدخال البريد الإلكتروني وكلمة المرور." };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: "بيانات الدخول غير صحيحة. تأكد من البريد الإلكتروني وكلمة المرور." };
  }
  redirect("/dashboard");
}

export async function registerAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (fullName.length < 3) return { ok: false, error: "يرجى إدخال الاسم الثلاثي على الأقل." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "يرجى إدخال بريد إلكتروني صحيح." };
  if (password.length < 6) return { ok: false, error: "كلمة المرور يجب ألا تقل عن 6 أحرف." };

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) {
    if (error.message.includes("already")) {
      return { ok: false, error: "هذا البريد الإلكتروني مسجل بالفعل." };
    }
    return { ok: false, error: "حدث خطأ أثناء إنشاء الحساب. حاول مرة أخرى." };
  }
  redirect("/login?registered=1");
}

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "يرجى إدخال البريد الإلكتروني." };

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/update-password`,
  });
  if (error) {
    return { ok: false, error: "تعذر إرسال رابط الاستعادة. حاول مرة أخرى." };
  }
  return { ok: true };
}

export async function updatePasswordAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 6) return { ok: false, error: "كلمة المرور يجب ألا تقل عن 6 أحرف." };
  if (password !== confirm) return { ok: false, error: "كلمتا المرور غير متطابقتين." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "انتهت الجلسة، يرجى الدخول مجدداً." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: "حدث خطأ أثناء تحديث كلمة المرور." };

  // Clear the first-login onboarding flag now that a personal password is set.
  await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
