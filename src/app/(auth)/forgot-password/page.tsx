"use client";

import * as React from "react";
import Link from "next/link";
import { HeartHandshake, MailCheck } from "lucide-react";
import { forgotPasswordAction, type ActionResult } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export default function ForgotPasswordPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res: ActionResult = await forgotPasswordAction(formData);
    setLoading(false);
    if (res.ok) setSent(true);
    else setError(res.error ?? "حدث خطأ");
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

      {sent ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-6 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">
            تم إرسال رابط الاستعادة
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            تحقق من بريدك الإلكتروني واتبع الرابط لإعادة تعيين كلمة المرور.
          </p>
          <Button variant="secondary" className="mt-5" onClick={() => setSent(false)}>
            إعادة الإرسال
          </Button>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-extrabold text-slate-900">
            استعادة كلمة المرور
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            أدخل بريدك الإلكتروني وسنرسل لك رابط الاستعادة
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
                placeholder="you@example.com"
                required
              />
            </Field>
            <Button type="submit" className="w-full" loading={loading}>
              إرسال رابط الاستعادة
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            تذكرت كلمة المرور؟{" "}
            <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
              سجّل الدخول
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
