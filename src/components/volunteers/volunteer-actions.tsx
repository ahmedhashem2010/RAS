"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, UserX, UserCheck, Shield, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  setVolunteerStatus,
  setVolunteerRole,
  updateVolunteerProfile,
} from "@/lib/actions/volunteers";
import { issueWarning } from "@/lib/actions/warnings";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Profile } from "@/lib/types";

export function VolunteerActions({ profile, warningLimit }: { profile: Profile; warningLimit: number }) {
  const { toast } = useToast();
  const router = useRouter();
  const [modal, setModal] = React.useState<null | "edit" | "warn" | "role">(null);
  const [loading, setLoading] = React.useState(false);
  const [isSuper, setIsSuper] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user!.id)
          .single()
          .then(({ data: p }) => setIsSuper(p?.role === "super_admin"));
      }
    });
  }, []);

  async function ban() {
    if (!confirm(`هل أنت متأكد من ${profile.status === "banned" ? "إعادة تفعيل" : "حظر"} ${profile.full_name}؟`)) return;
    setLoading(true);
    const res = await setVolunteerStatus(profile.id, profile.status === "banned" ? "active" : "banned");
    setLoading(false);
    if (!res.ok) return toast("error", "حدث خطأ", res.error);
    toast("success", profile.status === "banned" ? "تمت إعادة التفعيل" : "تم حظر الحساب");
    router.refresh();
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const res = await updateVolunteerProfile(profile.id, {
      full_name: String(fd.get("fullName") ?? ""),
      phone: String(fd.get("phone") ?? "") || null,
      age: fd.get("age") ? Number(fd.get("age")) : null,
      join_date: String(fd.get("joinDate") ?? "") || null,
    });
    setLoading(false);
    if (!res.ok) return toast("error", "تعذر الحفظ", res.error);
    toast("success", "تم تحديث البيانات");
    setModal(null);
    router.refresh();
  }

  async function handleWarn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const reason = String(fd.get("reason") ?? "").trim();
    if (!reason) return toast("warning", "سبب الإنذار مطلوب");
    setLoading(true);
    const res = await issueWarning({ volunteerId: profile.id, reason });
    setLoading(false);
    if (!res.ok) return toast("error", "تعذر إصدار الإنذار", res.error);
    toast("success", `تم إصدار الإنذار رقم ${(res as { number?: number }).number}`);
    setModal(null);
    router.refresh();
  }

  async function handleRole(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const res = await setVolunteerRole(profile.id, String(fd.get("role")) as "volunteer" | "general_admin" | "super_admin");
    setLoading(false);
    if (!res.ok) return toast("error", "تعذر تغيير الدور", res.error);
    toast("success", "تم تغيير الدور");
    setModal(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setModal("edit")}>
        <Pencil className="h-3.5 w-3.5" />
        تعديل البيانات
      </Button>

      <Button size="sm" variant="danger" onClick={ban} loading={loading}>
        {profile.status === "banned" ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
        {profile.status === "banned" ? "إعادة تفعيل" : "حظر"}
      </Button>

      {profile.status !== "banned" && (
        <Button size="sm" variant="gold" onClick={() => setModal("warn")}>
          <ShieldAlert className="h-3.5 w-3.5" />
          إصدار إنذار
        </Button>
      )}

      {isSuper && (
        <Button size="sm" variant="outline" onClick={() => setModal("role")}>
          <Shield className="h-3.5 w-3.5" />
          الدور والصلاحيات
        </Button>
      )}

      {/* Edit modal */}
      <Modal
        open={modal === "edit"}
        onClose={() => setModal(null)}
        title="تعديل بيانات المتطوع"
      >
        <form onSubmit={handleEdit} className="space-y-4">
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
          <Field label="تاريخ الانضمام">
            <Input type="date" name="joinDate" defaultValue={profile.join_date ?? ""} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>إلغاء</Button>
            <Button type="submit" loading={loading}>حفظ</Button>
          </div>
        </form>
      </Modal>

      {/* Warning modal */}
      <Modal
        open={modal === "warn"}
        onClose={() => setModal(null)}
        title={`إصدار إنذار — ${profile.full_name}`}
        description="سبب الإنذار مطلوب ولا يمكن إصدار إنذار بلا تفسير."
      >
        <form onSubmit={handleWarn} className="space-y-4">
          <Field label="سبب الإنذار" required>
            <Textarea
              name="reason"
              rows={3}
              placeholder="اشرح سبب الإنذار بوضوح..."
              required
            />
          </Field>
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
            عند الوصول إلى {warningLimit} إنذارات يظهر تنبيه للمديرين لاتخاذ القرار (حظر أو متابعة). لا يتم الحظر تلقائياً.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>إلغاء</Button>
            <Button type="submit" variant="danger" loading={loading}>إصدار الإنذار</Button>
          </div>
        </form>
      </Modal>

      {/* Role modal */}
      <Modal
        open={modal === "role"}
        onClose={() => setModal(null)}
        title="الدور والصلاحيات"
        description="يحتاج صلاحية مدير النظام."
      >
        <form onSubmit={handleRole} className="space-y-4">
          <Field label="الدور">
            <Select name="role" defaultValue={profile.role}>
              <option value="volunteer">متطوع</option>
              <option value="general_admin">مدير عام</option>
              <option value="super_admin">مدير النظام</option>
            </Select>
          </Field>
          <p className="rounded-lg bg-brand-50 px-4 py-3 text-xs text-slate-600">
            مدير عام + قائد مجموعة مسموح به — المدير الذي يقود مجموعة يمكنه ترشيح نفسه لجائزة أفضل قائد.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>إلغاء</Button>
            <Button type="submit" loading={loading}>حفظ الدور</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
