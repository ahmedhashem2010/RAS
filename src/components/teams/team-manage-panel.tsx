"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserPlus, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addMember, removeMember, assignLeader, removeLeader } from "@/lib/actions/teams";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select, Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function TeamManagePanel({
  teamId,
  mode,
  memberId,
  leaderId,
  name,
}: {
  teamId: string;
  mode: "member" | "member-remove" | "leader" | "leader-remove";
  memberId?: string;
  leaderId?: string;
  name?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<Array<{ id: string; full_name: string }>>([]);
  const [selected, setSelected] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function loadOptions() {
    const supabase = createClient();
    if (mode === "member") {
      const [{ data: existing }, { data: profiles }] = await Promise.all([
        supabase.from("team_members").select("volunteer_id").eq("team_id", teamId),
        supabase.rpc("get_active_profiles"),
      ]);
      const existingIds = new Set((existing ?? []).map((e) => e.volunteer_id));
      setOptions(((profiles ?? []) as Array<{ id: string; full_name: string }>).filter((p) => !existingIds.has(p.id)));
    } else if (mode === "leader") {
      const [{ data: members }, { data: leaders }, { data: allLeaders }] = await Promise.all([
        supabase.from("team_members").select("volunteer_id").eq("team_id", teamId),
        supabase.from("team_leaders").select("leader_id").eq("team_id", teamId),
        supabase.from("team_leaders").select("leader_id"),
      ]);
      const memberIds = new Set((members ?? []).map((m) => m.volunteer_id));
      const busyIds = new Set([...(allLeaders ?? []).map((l) => l.leader_id), ...(leaders ?? []).map((l) => l.leader_id)]);
      const { data: profiles } = await supabase.rpc("get_active_profiles");
      setOptions(
        ((profiles ?? []) as Array<{ id: string; full_name: string }>).filter((p) => memberIds.has(p.id) && !busyIds.has(p.id)),
      );
    }
  }

  async function openModal() {
    setOpen(true);
    setSelected("");
    await loadOptions();
  }

  async function handleAdd() {
    if (!selected) {
      toast("warning", "يرجى اختيار متطوع");
      return;
    }
    setLoading(true);
    const res =
      mode === "member"
        ? await addMember(teamId, selected)
        : await assignLeader(teamId, selected);
    setLoading(false);
    if (!res.ok) {
      toast("error", mode === "member" ? "تعذر إضافة العضو" : "تعذر تعيين القائد", res.error);
      return;
    }
    toast("success", mode === "member" ? "تمت إضافة العضو" : "تم تعيين القائد");
    setOpen(false);
    router.refresh();
  }

  async function handleRemove() {
    const target = memberId ?? leaderId;
    if (!target) return;
    setLoading(true);
    const res =
      mode === "member-remove"
        ? await removeMember(teamId, target)
        : await removeLeader(teamId, target);
    setLoading(false);
    if (!res.ok) {
      toast("error", "حدث خطأ", res.error);
      return;
    }
    toast("success", "تمت الإزالة");
    router.refresh();
  }

  if (mode === "member-remove" || mode === "leader-remove") {
    return (
      <button
        onClick={handleRemove}
        className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
        title={`إزالة ${name ?? ""}`}
        disabled={loading}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant={mode === "leader" ? "outline" : "secondary"}
        onClick={openModal}
      >
        {mode === "leader" ? (
          <>
            <ShieldCheck className="h-4 w-4" />
            تعيين قائد
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" />
            إضافة عضو
          </>
        )}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={mode === "leader" ? "تعيين قائد للفريق" : "إضافة عضو للفريق"}
        description={
          mode === "leader"
            ? "ملاحظة: لا يمكن للشخص أن يقود أكثر من فريق واحد."
            : "اختر متطوعاً لإضافته إلى الفريق."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAdd} loading={loading} disabled={options.length === 0}>
              <Plus className="h-4 w-4" />
              {mode === "leader" ? "تعيين" : "إضافة"}
            </Button>
          </>
        }
      >
        {options.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            {mode === "leader"
              ? "لا يوجد أعضاء متاحون للتعيين كقادة."
              : "لا يوجد متطوعون متاحون للإضافة."}
          </p>
        ) : (
          <Field label="اختر المتطوع" required>
            <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">— اختر —</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Modal>
    </>
  );
}
