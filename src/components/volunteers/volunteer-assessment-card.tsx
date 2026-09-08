"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Star, Pencil } from "lucide-react";
import { updateVolunteerAssessment } from "@/lib/actions/volunteers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { StarRating } from "@/components/ui/star-rating";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/** Standing assessment (rating + description + notes) on a roster volunteer. */
export function VolunteerAssessmentCard({
  volunteerId,
  fullName,
  rating,
  description,
  notes,
  canEdit,
}: {
  volunteerId: string;
  fullName: string;
  rating: number | null;
  description: string | null;
  notes: string | null;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [draftRating, setDraftRating] = React.useState(rating ?? 0);
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    const res = await updateVolunteerAssessment(volunteerId, {
      rating: draftRating || null,
      description: String(fd.get("description") ?? "") || null,
      notes: String(fd.get("notes") ?? "") || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast("error", "تعذر حفظ التقييم العام", res.error);
      return;
    }
    toast("success", "تم حفظ التقييم العام");
    setOpen(false);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Star className="h-4 w-4 text-gold-500" />
            التقييم العام
          </p>
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              تعديل
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {rating ? (
            <>
              <StarRating value={rating} readOnly size="md" />
              <span className="text-sm font-extrabold text-gold-600">{rating}/5</span>
            </>
          ) : (
            <p className="text-xs text-slate-400">لا يوجد تقييم بعد — يسجله مدير النظام.</p>
          )}
        </div>

        {description && (
          <p className="rounded-lg bg-brand-50/60 p-3 text-sm leading-relaxed text-slate-700">
            {description}
          </p>
        )}
        {notes && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
            <span className="font-semibold text-slate-600">ملاحظات: </span>
            {notes}
          </p>
        )}
      </CardContent>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="التقييم العام للمتطوع"
        description={fullName}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="submit" form="assessment-form" loading={saving}>حفظ</Button>
          </>
        }
      >
        <form id="assessment-form" onSubmit={submit} className="space-y-4">
          <Field label="التقييم (1-5)" required>
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
              <StarRating value={draftRating} onChange={setDraftRating} />
              <span className="text-sm font-extrabold text-gold-600">
                {draftRating ? `${draftRating}/5` : "بدون تقييم"}
              </span>
            </div>
          </Field>
          <Field label="الوصف">
            <Textarea name="description" rows={3} defaultValue={description ?? ""} placeholder="وصف مختصر لتقييم المتطوع العام" />
          </Field>
          <Field label="ملاحظات">
            <Textarea name="notes" rows={2} defaultValue={notes ?? ""} placeholder="ملاحظات إدارية داخلية" />
          </Field>
        </form>
      </Modal>
    </Card>
  );
}