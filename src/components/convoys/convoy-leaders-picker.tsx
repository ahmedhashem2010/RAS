"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { setConvoyLeaders } from "@/lib/actions/convoys";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export interface LeaderOption {
  profileId: string | null;
  fullName: string;
  committeeName: string;
  isDeputy: boolean;
}

/**
 * Super-admin control: marks which committee leaders attended the convoy.
 * Only marked leaders can later record attendance/ratings (DB-enforced).
 */
export function ConvoyLeadersPicker({
  convoyId,
  leaders,
  initial,
}: {
  convoyId: string;
  leaders: LeaderOption[];
  initial: string[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(initial));
  const [saving, setSaving] = React.useState(false);

  const byCommittee = React.useMemo(() => {
    const map = new Map<string, LeaderOption[]>();
    for (const l of leaders) {
      if (!l.profileId) continue;
      const arr = map.get(l.committeeName) ?? [];
      arr.push(l);
      map.set(l.committeeName, arr);
    }
    return [...map.entries()];
  }, [leaders]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const res = await setConvoyLeaders(convoyId, [...selected]);
    setSaving(false);
    if (!res.ok) {
      toast("error", "تعذر تحديث القادة الحاضرين", res.error);
      return;
    }
    toast("success", "تم تحديث القادة الحاضرين");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {byCommittee.length === 0 ? (
        <p className="text-sm text-slate-500">لا يوجد قادة لجان (أو أنهم غير مرتبطين بحسابات دخول).</p>
      ) : (
        <div className="space-y-3">
          {byCommittee.map(([committeeName, members]) => (
            <div key={committeeName}>
              <p className="mb-1.5 text-sm font-bold text-slate-700">{committeeName}</p>
              <div className="space-y-1.5">
                {members.map((l) => (
                  <label key={l.profileId!} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.has(l.profileId!)}
                      onChange={() => toggle(l.profileId!)}
                      className="h-4 w-4 accent-brand-700"
                    />
                    <span className="flex-1 text-sm font-medium text-slate-800">{l.fullName}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      {l.isDeputy ? "نائب" : "قائد"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Button className="w-full" size="lg" onClick={handleSave} loading={saving} disabled={byCommittee.length === 0}>
        <Save className="h-4 w-4" />
        حفظ القادة الحاضرين
      </Button>
    </div>
  );
}