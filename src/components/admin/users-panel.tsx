"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, UserCog } from "lucide-react";
import { createUser, setVolunteerRole } from "@/lib/actions/volunteers";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { roleLabels } from "@/lib/i18n";

export function UsersPanel() {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const res = await createUser(new FormData(e.currentTarget));
    setLoading(false);
    if (!res.ok) return toast("error", "تعذر إنشاء المستخدم", res.error);
    toast("success", "تم إنشاء المستخدم");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        مستخدم جديد
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="إنشاء مستخدم جديد"
        description="سيتم إنشاء حساب مع إمكانية تسجيل الدخول."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="الاسم الكامل" required>
            <Input name="fullName" required minLength={3} placeholder="الاسم كما سيظهر في النظام" />
          </Field>
          <Field label="البريد الإلكتروني" required>
            <Input name="email" type="email" required dir="ltr" placeholder="user@example.com" />
          </Field>
          <Field label="كلمة المرور" required>
            <Input name="password" type="password" required minLength={6} dir="ltr" placeholder="6 أحرف على الأقل" />
          </Field>
          <Field label="الدور" required>
            <Select name="role" defaultValue="volunteer">
              <option value="volunteer">{roleLabels.volunteer}</option>
              <option value="general_admin">{roleLabels.general_admin}</option>
              <option value="super_admin">{roleLabels.super_admin}</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="submit" loading={loading}>إنشاء الحساب</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function RoleSelect({
  userId,
  currentRole,
  disabled,
}: {
  userId: string;
  currentRole: string;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function change(role: string) {
    if (role === currentRole) return;
    if (currentRole === "super_admin" && role !== "super_admin") {
      if (!confirm("خفض صلاحية مدير النظام قد يمنعه من الدخول مرة أخرى. هل أنت متأكد؟")) {
        return;
      }
    }
    setLoading(true);
    const res = await setVolunteerRole(userId, role as "volunteer" | "general_admin" | "super_admin");
    setLoading(false);
    if (!res.ok) return toast("error", "تعذر تغيير الدور", res.error);
    toast("success", "تم تحديث الدور");
    router.refresh();
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <UserCog className="h-3.5 w-3.5 text-slate-400" />
      <select
        value={currentRole}
        disabled={disabled || loading}
        onChange={(e) => change(e.target.value)}
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="volunteer">{roleLabels.volunteer}</option>
        <option value="general_admin">{roleLabels.general_admin}</option>
        <option value="super_admin">{roleLabels.super_admin}</option>
      </select>
    </div>
  );
}
