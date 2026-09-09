"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateSettings, type AppSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [warningLimit, setWarningLimit] = React.useState(settings.warning_limit);

  async function save() {
    setLoading(true);
    const res = await updateSettings({
      warning_limit: Math.min(10, Math.max(1, Math.round(Number(warningLimit) || 3))),
    });
    setLoading(false);
    if (!res.ok) return toast("error", "تعذر الحفظ", res.error);
    toast("success", "تم حفظ الإعدادات");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Field label="الحد الأقصى للإنذارات قبل اتخاذ قرار">
        <Input
          type="number"
          min={1}
          max={10}
          value={warningLimit}
          onChange={(e) => setWarningLimit(Number(e.target.value))}
        />
        <p className="mt-1 text-xs text-slate-400">
          عند الوصول لهذا الحد يظهر تنبيه للمديرين لاتخاذ قرار (حظر أو متابعة). لا يتم الحظر تلقائياً.
        </p>
      </Field>

      <div className="flex justify-end pt-2">
        <Button onClick={save} loading={loading}>حفظ الإعدادات</Button>
      </div>
    </div>
  );
}
