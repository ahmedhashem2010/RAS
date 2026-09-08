"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserX, UserCheck, Link2, Trash2 } from "lucide-react";
import { updateRosterVolunteer, setRosterStatus, deleteRosterVolunteer } from "@/lib/actions/volunteers";
import { LinkProfileModal } from "@/components/volunteers/link-profile-modal";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function VolunteerDetailActions({
  id,
  status,
  profileId,
  fullName,
  canEdit,
  canManage,
  canDelete,
  canLink,
}: {
  id: string;
  status: "active" | "inactive";
  profileId: string | null;
  fullName: string;
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
  canLink: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [linking, setLinking] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function submitEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const res = await updateRosterVolunteer(id, {
      full_name: String(fd.get("full_name") ?? ""),
      phone: String(fd.get("phone") ?? "") || null,
      notes: String(fd.get("notes") ?? "") || null,
    });
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر تعديل المتطوع", res.error);
      return;
    }
    toast("success", "تم حفظ التعديلات");
    setEditing(false);
    router.refresh();
  }

  async function toggleStatus() {
    const next = status === "active" ? "inactive" : "active";
    setLoading(true);
    const res = await setRosterStatus(id, next);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر تحديث الحالة", res.error);
      return;
    }
    toast("success", next === "active" ? "تمت إعادة تفعيل المتطوع" : "تم إيقاف المتطوع");
    router.refresh();
  }

  async function submitDelete() {
    setLoading(true);
    const res = await deleteRosterVolunteer(id);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر حذف المتطوع", res.error);
      return;
    }
    toast("success", "تم حذف المتطوع نهائياً");
    router.replace("/volunteers");
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {canEdit && (
          <Button onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            تعديل البيانات
          </Button>
        )}
        {canManage && (
          <Button variant="danger" onClick={toggleStatus} loading={loading}>
            {status === "active" ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            {status === "active" ? "إيقاف المتطوع" : "إعادة تفعيل"}
          </Button>
        )}
        {canLink && (
          <Button variant="secondary" onClick={() => setLinking(true)}>
            <Link2 className="h-4 w-4" />
            {profileId ? "إدارة ربط الحساب" : "ربط حساب الدخول"}
          </Button>
        )}
        {canDelete && (
          <Button variant="outline" onClick={() => setDeleting(true)}>
            <Trash2 className="h-4 w-4" />
            حذف نهائي
          </Button>
        )}
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="تعديل بيانات المتطوع"
        description={fullName}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(false)}>إلغاء</Button>
            <Button type="submit" form="detail-edit-form" loading={loading}>حفظ</Button>
          </>
        }
      >
        <form id="detail-edit-form" onSubmit={submitEdit} className="space-y-4">
          <Field label="الاسم الكامل" required>
            <Input name="full_name" required minLength={3} defaultValue={fullName} />
          </Field>
          <Field label="الهاتف">
            <Input name="phone" dir="ltr" />
          </Field>
          <Field label="ملاحظات">
            <Textarea name="notes" rows={3} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="حذف متطوع نهائياً"
        description="لا يمكن التراجع عن هذه العملية."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>إلغاء</Button>
            <Button variant="danger" onClick={submitDelete} loading={loading}>حذف نهائي</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">هل أنت متأكد من حذف <strong>{fullName}</strong> من سجل المتطوعين؟</p>
      </Modal>

      {canLink && (
        <LinkProfileModal
          open={linking}
          profileId={profileId}
          volunteer={{ id, full_name: fullName }}
          onClose={() => setLinking(false)}
          onSubmitted={() => router.refresh()}
        />
      )}
    </>
  );
}