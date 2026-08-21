"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Pencil } from "lucide-react";
import { updateOwnProfile, uploadAvatar } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";

export function ProfileEdit({ profile }: { profile: { id: string; full_name: string; phone: string | null; age: number | null } }) {
  const { toast } = useToast();
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setLoading(true);
    const res = await uploadAvatar(fd);
    setLoading(false);
    if (!res.ok) return toast("error", "تعذر رفع الصورة", res.error);
    toast("success", "تم تحديث الصورة");
    router.refresh();
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const res = await updateOwnProfile({
      full_name: String(fd.get("fullName") ?? ""),
      phone: String(fd.get("phone") ?? "") || null,
      age: fd.get("age") ? Number(fd.get("age")) : null,
    });
    setLoading(false);
    if (!res.ok) return toast("error", "تعذر الحفظ", res.error);
    toast("success", "تم حفظ البيانات");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" />
          تغيير الصورة
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={loading}
            onChange={handleAvatar}
          />
        </label>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" />
          تعديل البيانات
        </Button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="تعديل بياناتي">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={profile.full_name} size="lg" />
            <p className="text-sm text-slate-500">
              يمكنك تحديث الاسم ورقم الهاتف والعمر من هنا.
            </p>
          </div>
          <Field label="الاسم الكامل" required>
            <Input name="fullName" defaultValue={profile.full_name} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="رقم الهاتف">
              <Input name="phone" defaultValue={profile.phone ?? ""} dir="ltr" placeholder="01xxxxxxxxx" />
            </Field>
            <Field label="العمر">
              <Input type="number" name="age" defaultValue={profile.age ?? ""} min={10} max={120} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="submit" loading={loading}>حفظ</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
