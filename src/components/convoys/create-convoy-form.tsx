"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createConvoy } from "@/lib/actions/convoys";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { convoyTypeLabels } from "@/lib/i18n";

export function CreateConvoyForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [type, setType] = React.useState("normal");
  const [startDate, setStartDate] = React.useState("");

  const durationLabel: Record<string, string> = {
    normal: "يوم واحد",
    mini_camp: "يومان",
    full_camp: "3 أيام",
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res = await createConvoy(formData);
    if (!res.ok) {
      setError(res.error ?? "حدث خطأ");
      setLoading(false);
      return;
    }
    router.push(`/convoys/${(res as { id?: string }).id}`);
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="إنشاء قافلة جديدة"
        description="حدد تفاصيل القافلة الطبية القادمة"
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
          <CardTitle>بيانات القافلة</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Field label="اسم القافلة" required>
              <Input name="name" placeholder="قافلة الإسكندرية الطبية" required />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="نوع القافلة" required>
                <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="normal">{convoyTypeLabels.normal} — {durationLabel.normal}</option>
                  <option value="mini_camp">{convoyTypeLabels.mini_camp} — {durationLabel.mini_camp}</option>
                  <option value="full_camp">{convoyTypeLabels.full_camp} — {durationLabel.full_camp}</option>
                </Select>
              </Field>
              <Field label="تاريخ البدء" required>
                <Input
                  type="date"
                  name="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              مدة القافلة: <span className="font-bold">{durationLabel[type]}</span>
              {startDate && (
                <span>
                  {" "}· تنتهي في{" "}
                  {(() => {
                    const d = new Date(startDate);
                    d.setDate(d.getDate() + (type === "full_camp" ? 2 : type === "mini_camp" ? 1 : 0));
                    return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
                  })()}
                </span>
              )}
            </div>

            <Field label="الموقع" required={false}>
              <Input name="location" placeholder="مثال: قرية النصر، الإسكندرية" />
            </Field>

            <Field label="وصف القافلة">
              <Textarea name="description" rows={3} placeholder="معلومات عامة عن القافلة وأهدافها" />
            </Field>

            <Field label="تعليمات للمتطوعين">
              <Textarea name="instructions" rows={3} placeholder="تعليمات الحضور، مواعيد التجمع، الأدوات المطلوبة..." />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                إلغاء
              </Button>
              <Button type="submit" loading={loading}>
                إنشاء القافلة
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
