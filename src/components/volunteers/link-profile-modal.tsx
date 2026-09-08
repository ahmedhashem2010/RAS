"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { linkVolunteerProfile } from "@/lib/actions/volunteers";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function LinkProfileModal({
  open,
  profileId,
  volunteer,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  profileId?: string | null;
  volunteer: { id: string; full_name: string } | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const [profiles, setProfiles] = React.useState<Array<{ id: string; full_name: string }>>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_active_profiles");
      if (!active) return;
      setProfiles((data ?? []) as Array<{ id: string; full_name: string }>);
    })();
    return () => {
      active = false;
    };
  }, [open]);

  async function submit(formData: FormData) {
    if (!volunteer) return;
    setLoading(true);
    const profileId = String(formData.get("profile_id") ?? "").trim() || null;
    const res = await linkVolunteerProfile(volunteer.id, profileId);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر ربط الحساب", res.error);
      return;
    }
    toast("success", profileId ? "تم ربط الحساب" : "تم فك ربط الحساب");
    onClose();
    onSubmitted();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ربط حساب الدخول"
      description={volunteer?.full_name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit" form="vol-link-form" loading={loading}>حفظ</Button>
        </>
      }
    >
      <form id="vol-link-form" action={submit} className="space-y-3">
        <Field label="حساب Supabase">
          <select name="profile_id" defaultValue={profileId ?? ""} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none">
            <option value="">— بدون حساب —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-slate-400">
          يسمح ربط الحساب للمتطوع بدخول النظام وإدارة بياناته ومتابعة اللجان.
        </p>
      </form>
    </Modal>
  );
}