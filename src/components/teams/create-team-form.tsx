"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createTeam } from "@/lib/actions/teams";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { evalModeLabels } from "@/lib/i18n";

const presetColors = [
  "#0d9488",
  "#0891b2",
  "#1d4ed8",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#d97706",
  "#16a34a",
];

export function CreateTeamForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [color, setColor] = React.useState("#0d9488");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res = await createTeam(formData);
    if (!res.ok) {
      setError(res.error ?? "حدث خطأ");
      setLoading(false);
      return;
    }
    toast("success", "تم إنشاء مجموعة العمل");
    router.push(`/teams/${(res as { id?: string }).id}`);
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="إنشاء مجموعة عمل جديدة"
        description="أضف مجموعة عمل جديدة للمنظمة"
        action={
          <button
            onClick={() => router.back()}
            className="inline-flex h-10 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowRight className="h-4 w-4" />
            رجوع
          </button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>بيانات مجموعة العمل</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Field label="اسم المجموعة" required>
              <Input name="name" placeholder="مثال: مجموعة الإعلام" required minLength={2} />
            </Field>

            <Field label="وصف المجموعة">
              <Textarea
                name="description"
                rows={3}
                placeholder="وصف مختصر لطبيعة عمل المجموعة (اختياري)"
              />
            </Field>

            <Field label="طريقة التقييم" required>
              <Select name="evalMode" defaultValue="attendance">
                <option value="attendance">{evalModeLabels.attendance}</option>
                <option value="media_work">{evalModeLabels.media_work}</option>
              </Select>
            </Field>

            <Field label="اللون المميز">
              <div className="flex flex-wrap gap-2">
                {presetColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`اللون ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className={`h-9 w-9 rounded-lg transition-transform hover:scale-110 ${
                      color === c ? "ring-2 ring-slate-900 ring-offset-2" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <input type="hidden" name="color" value={color} />
            </Field>

            <div className="flex flex-col-reverse justify-end gap-2 pt-2 sm:flex-row">
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                إلغاء
              </Button>
              <Button type="submit" loading={loading}>
                إنشاء مجموعة العمل
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
