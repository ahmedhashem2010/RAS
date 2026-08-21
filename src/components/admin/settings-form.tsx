"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateSettings, type AppSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-600" : "bg-slate-200"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-0.5" : "translate-x-[22px]"
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [warningLimit, setWarningLimit] = React.useState(settings.warning_limit);
  const [visibleToAll, setVisibleToAll] = React.useState(settings.leaderboard_visible_to_all);

  async function save() {
    setLoading(true);
    const res = await updateSettings({
      warning_limit: Math.min(10, Math.max(1, Math.round(Number(warningLimit) || 3))),
      leaderboard_visible_to_all: visibleToAll,
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

      <div className="divide-y divide-slate-100 border-t border-slate-100">
        <Toggle
          checked={visibleToAll}
          onChange={setVisibleToAll}
          label="إظهار لوحة الترتيب للجميع"
          hint="عند التفعيل يمكن لكل المتطوعين رؤية ترتيب كل الفرق. عند الإيقاف تظهر التفاصيل للمديرين والقادة فقط."
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={save} loading={loading}>حفظ الإعدادات</Button>
      </div>
    </div>
  );
}
