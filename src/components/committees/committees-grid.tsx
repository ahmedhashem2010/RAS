"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, Pencil, Trash2, Plus, Crown } from "lucide-react";
import { createDepartment, updateDepartment, deleteDepartment } from "@/lib/actions/committees";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { committeeRoleLabels } from "@/lib/i18n";
import type { CommitteeWithLeaders } from "@/lib/types";

export function CommitteesGrid({
  committees,
  canManage,
}: {
  committees: CommitteeWithLeaders[];
  canManage: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<CommitteeWithLeaders | null>(null);
  const [deleting, setDeleting] = React.useState<CommitteeWithLeaders | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function submit(formData: FormData) {
    setLoading(true);
    const name = String(formData.get("name") ?? "");
    const name_en = String(formData.get("name_en") ?? "");
    const description = String(formData.get("description") ?? "").trim() || null;
    const res = editing
      ? await updateDepartment(editing.id, { name, description, sort_order: 0 })
      : await createDepartment({ name, name_en, description });
    setLoading(false);
    if (!res.ok) {
      toast("error", editing ? "تعذر تعديل اللجنة" : "تعذر إضافة اللجنة", res.error);
      return;
    }
    toast("success", editing ? "تم حفظ اللجنة" : "تمت إضافة اللجنة");
    setAdding(false);
    setEditing(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setLoading(true);
    const res = await deleteDepartment(deleting.id);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر حذف اللجنة", res.error);
      return;
    }
    toast("success", "تم حذف اللجنة");
    setDeleting(null);
    router.refresh();
  }

  return (
    <div>
      {canManage && (
        <div className="flex justify-end p-4 pb-0">
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            إضافة لجنة
          </Button>
        </div>
      )}

      {committees.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-slate-400">لا توجد لجان بعد.</p>
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {committees.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>{c.name}</span>
                  {c.name_en && <span className="text-xs font-normal text-slate-400" dir="ltr">({c.name_en})</span>}
                  <span className="mr-auto flex items-center gap-1 text-xs font-semibold text-slate-400">
                    <Users className="h-3.5 w-3.5" />
                    {c.memberCount}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                {c.description ? (
                  <p className="text-sm text-slate-500">{c.description}</p>
                ) : (
                  <p className="text-sm text-slate-300">لا وصف.</p>
                )}
                {c.leaders.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {c.leaders.map((l, i) => (
                      <div key={`${l.volunteerId}-${i}`} className="flex items-center gap-2 text-sm">
                        <Crown className={`h-3.5 w-3.5 ${l.isDeputy ? "text-blue-500" : "text-amber-500"}`} />
                        <span className="text-slate-700 font-semibold">{l.fullName}</span>
                        <Badge tone={l.isDeputy ? "blue" : "gold"} className="text-[10px]">
                          {committeeRoleLabels[l.isDeputy ? "deputy" : "leader"]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">لم يقم أحد بقيادة اللجنة بعد.</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <Link href={`/committees/${c.name_en}`} className="text-sm font-semibold text-brand-700 hover:text-brand-800">
                    تفاصيل اللجنة ←
                  </Link>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(c)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700" title="تعديل">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleting(c)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="حذف">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      <Modal
        open={adding || !!editing}
        onClose={() => { setAdding(false); setEditing(null); }}
        title={editing ? "تعديل اللجنة" : "إضافة لجنة"}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAdding(false); setEditing(null); }}>إلغاء</Button>
            <Button type="submit" form="dept-form" loading={loading}>حفظ</Button>
          </>
        }
      >
        <form id="dept-form" action={submit} className="space-y-4">
          <Field label="اسم اللجنة (بالعربية)" required>
            <Input name="name" required minLength={2} defaultValue={editing?.name ?? ""} />
          </Field>
          {!editing && (
            <Field label="المعرف الإنجليزي" required>
              <Input name="name_en" dir="ltr" required pattern="[a-z][a-z0-9_]*" />
            </Field>
          )}
          <Field label="وصف مختصر">
            <Textarea name="description" rows={2} defaultValue={editing?.description ?? ""} />
          </Field>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="حذف لجنة"
        description="سيتم حذف اللجنة من السجلات."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>إلغاء</Button>
            <Button variant="danger" onClick={confirmDelete} loading={loading}>حذف</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">هل أنت متأكد من حذف <strong>{deleting?.name}</strong>؟ لن تُحذف بيانات المتطوعين المرتبطين بها.</p>
      </Modal>
    </div>
  );
}