"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createAward } from "@/lib/actions/awards";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { awardTypeLabels } from "@/lib/i18n";

interface Option {
  id: string;
  full_name: string;
}

export function AwardForm({
  profiles,
  convoys,
}: {
  profiles: Option[];
  convoys: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const res = await createAward({
      type: String(fd.get("type")) as "volunteer_of_day" | "best_leader",
      recipientId: String(fd.get("recipientId") ?? ""),
      convoyId: String(fd.get("convoyId") ?? "") || null,
      eventName: String(fd.get("eventName") ?? "") || null,
      date: String(fd.get("date") ?? "") || undefined,
      reason: String(fd.get("reason") ?? "") || null,
    });
    setLoading(false);
    if (!res.ok) return toast("error", "تعذر إضافة الجائزة", res.error);
    toast("success", "تمت إضافة الجائزة");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        جائزة جديدة
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="إضافة جائزة"
        description="تكريم متطوع أو قائد بأحد أنواع الجوائز."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="المتطوع" required>
            <Select name="recipientId" required defaultValue="">
              <option value="" disabled>اختر المتطوع...</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </Select>
          </Field>

          <Field label="نوع الجائزة" required>
            <Select name="type" defaultValue="volunteer_of_day">
              <option value="volunteer_of_day">{awardTypeLabels.volunteer_of_day}</option>
              <option value="best_leader">{awardTypeLabels.best_leader}</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التاريخ">
              <Input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field label="اسم المناسبة">
              <Input name="eventName" placeholder="مثال: القافلة السابعة" />
            </Field>
          </div>

          <Field label="القافلة (اختياري)">
            <Select name="convoyId" defaultValue="">
              <option value="">بدون قافلة</option>
              {convoys.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="سبب الجائزة">
            <Textarea name="reason" rows={3} placeholder="مثال: التزامه الكامل وأداؤه المتميز خلال القوافل..." />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="submit" loading={loading}>إضافة</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
