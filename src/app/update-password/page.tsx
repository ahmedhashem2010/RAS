"use client";

import * as React from "react";
import { HeartHandshake } from "lucide-react";
import { updatePasswordAction, type ActionResult } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export default function UpdatePasswordPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res: ActionResult = await updatePasswordAction(formData);
    if (!res.ok) {
      setError(res.error ?? "حدث خطأ");
      setLoading(false);
    }
    // On success updatePasswordAction redirects.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700">
            <HeartHandshake className="h-5 w-5 text-white" />
          </div>
          <p className="text-lg font-extrabold text-slate-900">RAS</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <h1 className="text-xl font-extrabold text-slate-900">
            تعيين كلمة مرور جديدة
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            اختر كلمة مرور قوية جديدة لحسابك
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <Field label="كلمة المرور الجديدة" required>
              <Input
                type="password"
                name="password"
                dir="ltr"
                placeholder="••••••••"
                minLength={6}
                required
              />
            </Field>
            <Field label="تأكيد كلمة المرور" required>
              <Input
                type="password"
                name="confirm"
                dir="ltr"
                placeholder="••••••••"
                minLength={6}
                required
              />
            </Field>
            <Button type="submit" className="w-full" loading={loading}>
              حفظ كلمة المرور
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
