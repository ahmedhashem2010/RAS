"use client";

import * as React from "react";
import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { registerAction, type ActionResult } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export default function RegisterPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res: ActionResult = await registerAction(formData);
    if (!res.ok) {
      setError(res.error ?? "حدث خطأ");
      setLoading(false);
    }
    // On success registerAction redirects.
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-3 lg:hidden">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700">
          <HeartHandshake className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-lg font-extrabold text-slate-900">RAS</p>
          <p className="text-[10px] font-medium text-slate-500">
            RESALA ADMINISTRATION SYSTEM
          </p>
        </div>
      </div>

      <h1 className="text-2xl font-extrabold text-slate-900">إنشاء حساب</h1>
      <p className="mt-1 text-sm text-slate-500">
        انضم كمتطوع — سيقوم مدير النظام بإضافتك للفرق
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <Field label="الاسم الكامل" required>
          <Input name="fullName" placeholder="أحمد محمد عبد الله" required />
        </Field>
        <Field label="البريد الإلكتروني" required>
          <Input
            type="email"
            name="email"
            dir="ltr"
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field label="كلمة المرور" required>
          <Input
            type="password"
            name="password"
            dir="ltr"
            placeholder="••••••••"
            minLength={6}
            required
          />
        </Field>
        <Button type="submit" className="w-full" loading={loading}>
          إنشاء الحساب
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        لديك حساب بالفعل؟{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
          سجّل الدخول
        </Link>
      </p>
    </div>
  );
}
