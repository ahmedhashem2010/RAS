"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import type { Team } from "@/lib/types";

export function CreateTaskForm({
  teams,
  volunteers,
  preselectTeamId,
}: {
  teams: Team[];
  volunteers: { id: string; full_name: string; status: string }[];
  preselectTeamId?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [teamId, setTeamId] = React.useState(preselectTeamId ?? teams[0]?.id ?? "");
  const [assignTo, setAssignTo] = React.useState<"all" | string>("all");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setLoading(true);
    const res = await createTask({
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? "") || undefined,
      teamId,
      deadline: String(data.get("deadline") ?? "") || undefined,
      assignTo,
    });
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر إنشاء المهمة", res.error);
      return;
    }
    toast("success", "تم إنشاء المهمة وتعيينها");
    router.push(`/tasks/${(res as { id?: string }).id}`);
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="مهمة جديدة"
        description="المهام العادية تُدار من قادة المجموعات — القوافل لها صفحة منفصلة"
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
          <CardTitle>بيانات المهمة</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="عنوان المهمة" required>
              <Input name="title" placeholder="مثال: جرد صناديق الأدوية" required />
            </Field>

            <Field label="الوصف">
              <Textarea name="description" rows={3} placeholder="اشرح المطلوب بالتفصيل" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="المجموعة" required>
                <Select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  required
                  disabled={teams.length === 0}
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="الموعد النهائي">
                <Input type="date" name="deadline" />
              </Field>
            </div>

            <Field label="التعيين">
              <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="all">كل مجموعة {teams.find((t) => t.id === teamId)?.name ?? ""}</option>
                {volunteers.map((v) => (
                  <option key={v.id} value={v.id}>
                    متطوع: {v.full_name}
                  </option>
                ))}
              </Select>
            </Field>

            {assignTo === "all" && (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
                المهمة ستُعرض لكل أعضاء المجموعة المختارة، وسيرسل كل متطوع إنجازاً منفصلاً.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                إلغاء
              </Button>
              <Button type="submit" loading={loading}>
                إنشاء المهمة
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
