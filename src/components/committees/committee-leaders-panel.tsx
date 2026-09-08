"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Crown, Trash2, Plus } from "lucide-react";
import { setCommitteeLeader, removeCommitteeLeader } from "@/lib/actions/committees";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { committeeRoleLabels } from "@/lib/i18n";
import type { RosterVolunteer } from "@/lib/types";

interface LeaderEntry {
  volunteerId: string;
  fullName: string;
  profileId: string | null;
  isDeputy: boolean;
}

export function CommitteeLeadersPanel({
  committeeId,
  leaders,
  volunteers,
  canManage,
}: {
  committeeId: string;
  leaders: LeaderEntry[];
  volunteers: RosterVolunteer[];
  canManage: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const leaderIds = new Set(leaders.map((l) => l.volunteerId));
  const candidates = volunteers.filter((v) => !leaderIds.has(v.id) && v.status === "active");

  async function submit(formData: FormData) {
    setLoading(true);
    const volunteerId = String(formData.get("volunteer_id") ?? "");
    const isDeputy = formData.get("is_deputy") === "on";
    const res = await setCommitteeLeader(committeeId, volunteerId, isDeputy);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر تعيين القائد", res.error);
      return;
    }
    toast("success", isDeputy ? "تم تعيين نائب القائد" : "تم تعيين القائد");
    setAdding(false);
    router.refresh();
  }

  async function remove(volunteerId: string, name: string) {
    if (!confirm(`هل تريد إزالة ${name} من قيادة اللجنة؟`)) return;
    setLoading(true);
    const res = await removeCommitteeLeader(committeeId, volunteerId);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر إزالة القائد", res.error);
      return;
    }
    toast("success", "تمت الإزالة");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600">قيادة اللجنة</span>
        {canManage && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            تعيين قائد
          </Button>
        )}
      </div>

      {leaders.length === 0 ? (
        <p className="text-sm text-slate-400">لم يقم أحد بقيادة اللجنة بعد.</p>
      ) : (
        <div className="space-y-2">
          {leaders.map((l, i) => (
            <div key={`${l.volunteerId}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
              <Crown className={`h-4 w-4 ${l.isDeputy ? "text-blue-500" : "text-amber-500"}`} />
              <span className="flex-1 text-sm font-semibold text-slate-800">{l.fullName}</span>
              <Badge tone={l.isDeputy ? "blue" : "gold"} className="text-[10px]">
                {committeeRoleLabels[l.isDeputy ? "deputy" : "leader"]}
              </Badge>
              {canManage && (
                <button onClick={() => remove(l.volunteerId, l.fullName)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="إزالة">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="تعيين قائد اللجنة"
        description="اختر متطوعاً لقيادة اللجنة أو نائباً له."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>إلغاء</Button>
            <Button type="submit" form="leader-form" loading={loading}>تعيين</Button>
          </>
        }
      >
        <form id="leader-form" action={submit} className="space-y-4">
          <Field label="المتطوع" required>
            <select name="volunteer_id" required className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none">
              <option value="">اختر متطوعاً...</option>
              {candidates.map((v) => (
                <option key={v.id} value={v.id}>{v.full_name}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="is_deputy" className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500" />
            نائب قائد اللجنة (مسموح بمنصب واحد)
          </label>
        </form>
      </Modal>
    </div>
  );
}