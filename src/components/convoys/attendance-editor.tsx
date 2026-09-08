"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Check, HelpCircle, X, UserCheck } from "lucide-react";
import { saveAttendance } from "@/lib/actions/convoys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/types";

interface Member {
  id: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
}

const OPTIONS: Array<{ key: AttendanceStatus; label: string; icon: typeof Check; active: string; dot: string }> = [
  { key: "present", label: "حاضر", icon: Check, active: "bg-emerald-600 text-white", dot: "bg-emerald-500" },
  { key: "excused", label: "معذور", icon: HelpCircle, active: "bg-amber-500 text-white", dot: "bg-amber-500" },
  { key: "absent", label: "غائب", icon: X, active: "bg-red-600 text-white", dot: "bg-red-500" },
];

export function AttendanceEditor({
  convoyId,
  committeeId,
  committeeName,
  members,
  initial,
}: {
  convoyId: string;
  committeeId: string;
  committeeName: string;
  members: Member[];
  initial: Map<string, AttendanceStatus>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [status, setStatus] = React.useState<Record<string, AttendanceStatus>>(
    () => Object.fromEntries(initial),
  );
  const [saving, setSaving] = React.useState(false);

  const counts = React.useMemo(() => {
    const c = { present: 0, excused: 0, absent: 0, unmarked: 0 };
    for (const m of members) {
      const s = status[m.id];
      if (!s) c.unmarked += 1;
      else c[s] += 1;
    }
    return c;
  }, [members, status]);

  const points = React.useMemo(() => {
    let pts = 0;
    for (const m of members) {
      const s = status[m.id];
      if (s === "present") pts += 1;
      else if (s === "excused") pts += 0.5;
    }
    return pts;
  }, [members, status]);

  async function handleSave() {
    setSaving(true);
    const res = await saveAttendance(
      convoyId,
      committeeId,
      members.map((m) => ({ volunteerId: m.id, status: status[m.id] ?? "absent" })),
    );
    setSaving(false);
    if (!res.ok) {
      toast("error", "تعذر حفظ الحضور", res.error);
      return;
    }
    toast("success", "تم حفظ الحضور بنجاح");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-brand-700" />
            <div>
              <p className="text-sm font-bold text-slate-800">لجنة {committeeName}</p>
              <p className="text-xs text-slate-500">{members.length} متطوع</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next: Record<string, AttendanceStatus> = {};
              for (const m of members) next[m.id] = "present";
              setStatus(next);
            }}
            className="text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            تعليم الجميع حاضر
          </button>
        </div>

        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-slate-100 p-3"
            >
              <div className="flex items-center gap-3">
                <Avatar name={m.full_name} src={m.avatar_url} size="sm" />
                <span className="flex-1 truncate text-sm font-bold text-slate-800">
                  {m.full_name}
                </span>
                <span className="flex items-center gap-1.5">
                  {OPTIONS.map((opt) => {
                    const active = status[m.id] === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          setStatus((prev) => ({
                            ...prev,
                            [m.id]: prev[m.id] === opt.key ? (undefined as never) : opt.key,
                          }))
                        }
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-all",
                          active
                            ? opt.active
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                        )}
                        aria-pressed={active}
                      >
                        <opt.icon className="h-3.5 w-3.5" />
                        {opt.label}
                      </button>
                    );
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-lg bg-emerald-50 p-3">
            <p className="text-xl font-extrabold text-emerald-600">{counts.present}</p>
            <p className="text-[11px] font-medium text-emerald-700">حاضر</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3">
            <p className="text-xl font-extrabold text-amber-600">{counts.excused}</p>
            <p className="text-[11px] font-medium text-amber-700">معذور</p>
          </div>
          <div className="rounded-lg bg-red-50 p-3">
            <p className="text-xl font-extrabold text-red-600">{counts.absent}</p>
            <p className="text-[11px] font-medium text-red-700">غائب</p>
          </div>
          <div className="rounded-lg bg-slate-100 p-3">
            <p className="text-xl font-extrabold text-slate-600">{counts.unmarked}</p>
            <p className="text-[11px] font-medium text-slate-500">بدون تحديد</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-brand-100 bg-brand-50/50 px-4 py-3">
          <p className="text-sm font-bold text-slate-800">نقاط الحضور</p>
          <p className="text-lg font-extrabold text-brand-700">
            {points} <span className="text-xs font-semibold text-slate-500">من {members.length}</span>
          </p>
        </div>

        <Button className="w-full" size="lg" onClick={handleSave} loading={saving}>
          <Save className="h-4 w-4" />
          حفظ الحضور
        </Button>
      </CardContent>
    </Card>
  );
}
