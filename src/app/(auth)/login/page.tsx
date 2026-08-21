"use client";

import * as React from "react";
import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { loginAction, type ActionResult } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export default function LoginPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res: ActionResult = await loginAction(formData);
    if (!res.ok) {
      setError(res.error ?? "حدث خطأ");
      setLoading(false);
    }
    // On success loginAction redirects (never returns).
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

      <h1 className="text-2xl font-extrabold text-slate-900">تسجيل الدخول</h1>
      <p className="mt-1 text-sm text-slate-500">
        مرحباً بك مجدداً في منصة إدارة رسالة
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <Field label="البريد الإلكتروني" required>
          <Input
            type="email"
            name="email"
            dir="ltr"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field label="كلمة المرور" required>
          <Input
            type="password"
            name="password"
            dir="ltr"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </Field>
        <div className="flex items-center justify-between">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            نسيت كلمة المرور؟
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          دخول
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        ليس لديك حساب؟{" "}
        <Link href="/register" className="font-semibold text-brand-700 hover:text-brand-800">
          سجّل الآن
        </Link>
      </p>
    </div>
  );
}
