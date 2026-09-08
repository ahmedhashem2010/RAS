"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  UserMinus,
  Building2,
  Crown,
  Pencil,
  Layers,
  UserPlus,
  Trash2,
  Link2,
  ChevronLeft,
  UserX,
  UserCheck,
  Plus,
} from "lucide-react";
import {
  createRosterVolunteer,
  updateRosterVolunteer,
  setRosterStatus,
  deleteRosterVolunteer,
  assignVolunteerCommittees,
} from "@/lib/actions/volunteers";
import { LinkProfileModal } from "@/components/volunteers/link-profile-modal";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { normalizeArabicName } from "@/lib/utils";
import { committeeRoleLabels, volunteerStatusLabels } from "@/lib/i18n";
import type { RosterVolunteer, Department } from "@/lib/types";

interface Props {
  volunteers: RosterVolunteer[];
  committees: Department[];
  canManage: boolean;
  canDelete: boolean;
  canLink: boolean;
  ledCommitteeIds: string[];
}

type StatusFilter = "all" | "active" | "inactive";

export function VolunteersPanel({
  volunteers,
  committees,
  canManage,
  canDelete,
  canLink,
  ledCommitteeIds,
}: Props) {
  const { toast } = useToast();
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  const [committeeFilter, setCommitteeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<RosterVolunteer | null>(null);
  const [assigning, setAssigning] = React.useState<RosterVolunteer | null>(null);
  const [linking, setLinking] = React.useState<RosterVolunteer | null>(null);
  const [deleting, setDeleting] = React.useState<RosterVolunteer | null>(null);
  const [loading, setLoading] = React.useState(false);

  const committeeNames = React.useMemo(() => {
    const m = new Map<string, Department>();
    for (const c of committees) m.set(c.id, c);
    return m;
  }, [committees]);

  const stats = React.useMemo(() => {
    const active = volunteers.filter((v) => v.status === "active").length;
    const inactive = volunteers.length - active;
    const leaders = volunteers.filter((v) => v.leadership.length > 0).length;
    return { active, inactive, committees: committees.length, leaders };
  }, [volunteers, committees]);

  const filtered = React.useMemo(() => {
    const q = normalizeArabicName(query.trim());
    return volunteers.filter((v) => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (committeeFilter !== "all" && !v.committees.some((c) => c.id === committeeFilter)) return false;
      if (q && !v.search_name.includes(q) && !normalizeArabicName(v.full_name).includes(q)) return false;
      return true;
    });
  }, [volunteers, query, statusFilter, committeeFilter]);

  function canEdit(v: RosterVolunteer) {
    if (canManage) return true;
    return v.committees.some((c) => ledCommitteeIds.includes(c.id));
  }

  async function submitAdd(formData: FormData) {
    setLoading(true);
    const committee_ids = committees
      .map((c) => ({ checked: formData.get(`c-${c.id}`) as string | null, id: c.id }))
      .filter((c) => c.checked)
      .map((c) => c.id);
    const res = await createRosterVolunteer({
      full_name: String(formData.get("full_name") ?? ""),
      phone: String(formData.get("phone") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
      committee_ids,
    });
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر إضافة المتطوع", res.error);
      return;
    }
    toast("success", "تمت إضافة المتطوع");
    setAdding(false);
    router.refresh();
  }

  async function submitEdit(formData: FormData) {
    if (!editing) return;
    setLoading(true);
    const res = await updateRosterVolunteer(editing.id, {
      full_name: String(formData.get("full_name") ?? ""),
      phone: String(formData.get("phone") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    });
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر تعديل المتطوع", res.error);
      return;
    }
    toast("success", "تم حفظ التعديلات");
    setEditing(null);
    router.refresh();
  }

  async function submitCommittees(formData: FormData) {
    if (!assigning) return;
    setLoading(true);
    const committee_ids = committees
      .map((c) => ({ checked: formData.get(`c-${c.id}`) as string | null, id: c.id }))
      .filter((c) => c.checked)
      .map((c) => c.id);
    const res = await assignVolunteerCommittees(assigning.id, committee_ids);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر تحديث اللجان", res.error);
      return;
    }
    toast("success", "تم تحديث اللجان");
    setAssigning(null);
    router.refresh();
  }

  async function toggleStatus(v: RosterVolunteer) {
    const next = v.status === "active" ? "inactive" : "active";
    setLoading(true);
    const res = await setRosterStatus(v.id, next);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر تحديث الحالة", res.error);
      return;
    }
    toast("success", next === "active" ? "تمت إعادة تفعيل المتطوع" : "تم إيقاف المتطوع");
    router.refresh();
  }

  async function submitDelete() {
    if (!deleting) return;
    setLoading(true);
    const res = await deleteRosterVolunteer(deleting.id);
    setLoading(false);
    if (!res.ok) {
      toast("error", "تعذر حذف المتطوع", res.error);
      return;
    }
    toast("success", "تم حذف المتطوع نهائياً");
    setDeleting(null);
    router.refresh();
  }

  const leadershipOf = (v: RosterVolunteer) =>
    v.leadership.map((l) => ({
      committeeName: committeeNames.get(l.committee_id)?.name ?? "",
      label: committeeRoleLabels[l.is_deputy ? "deputy" : "leader"],
      isDeputy: l.is_deputy,
    }));

  return (
    <div>
      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="المتطوعون النشطون" value={stats.active} tone="teal" />
        <StatCard icon={UserMinus} label="منسحبون" value={stats.inactive} tone="slate" />
        <StatCard icon={Building2} label="اللجان" value={stats.committees} tone="blue" />
        <StatCard icon={Crown} label="القادة والنواب" value={stats.leaders} tone="gold" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالاسم بالعربية (جزئي)..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-9 pl-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={committeeFilter}
            onChange={(e) => setCommitteeFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="all">كل اللجان</option>
            {committees.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="flex gap-1.5">
            {(
              [
                ["all", "الكل"],
                ["active", "نشط"],
                ["inactive", "منسحب"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === key
                    ? "bg-brand-700 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              إضافة متطوع
            </Button>
          )}
        </div>
      </div>

      {/* Add modal */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="إضافة متطوع"
        description="أدخل بيانات المتطوع واختر اللجان التي ينتمي إليها."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>إلغاء</Button>
            <Button type="submit" form="vol-add-form" loading={loading}>
              <UserPlus className="h-4 w-4" />
              إضافة
            </Button>
          </>
        }
      >
        <form id="vol-add-form" onSubmit={(e) => { e.preventDefault(); submitAdd(new FormData(e.currentTarget)); }} className="space-y-4">
          <Field label="الاسم الكامل" required>
            <Input name="full_name" required minLength={3} />
          </Field>
          <Field label="الهاتف">
            <Input name="phone" dir="ltr" />
          </Field>
          <Field label="ملاحظات">
            <Textarea name="notes" rows={2} />
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">اللجان</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {committees.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" name={`c-${c.id}`} className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500" />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="تعديل بيانات المتطوع"
        description={editing?.full_name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>إلغاء</Button>
            <Button type="submit" form="vol-edit-form" loading={loading}>حفظ</Button>
          </>
        }
      >
        <form id="vol-edit-form" onSubmit={(e) => { e.preventDefault(); submitEdit(new FormData(e.currentTarget)); }} className="space-y-4">
          <Field label="الاسم الكامل" required>
            <Input name="full_name" required minLength={3} defaultValue={editing?.full_name ?? ""} />
          </Field>
          <Field label="الهاتف">
            <Input name="phone" dir="ltr" defaultValue={editing?.phone ?? ""} />
          </Field>
          <Field label="ملاحظات">
            <Textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
          </Field>
        </form>
      </Modal>

      {/* Assign committees modal */}
      <Modal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        title="تعيين اللجان"
        description={assigning?.full_name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssigning(null)}>إلغاء</Button>
            <Button type="submit" form="vol-com-form" loading={loading}>حفظ</Button>
          </>
        }
      >
        <form id="vol-com-form" onSubmit={(e) => { e.preventDefault(); submitCommittees(new FormData(e.currentTarget)); }} className="space-y-3">
          <span className="block text-sm text-slate-500">اختر اللجان التي ينتمي إليها هذا المتطوع.</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {committees.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name={`c-${c.id}`}
                  defaultChecked={assigning?.committees.some((x) => x.id === c.id) ?? false}
                  className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                />
                {c.name}
              </label>
            ))}
          </div>
        </form>
      </Modal>

      {/* Link account modal */}
      {canLink && (
        <LinkProfileModal
          open={!!linking}
          profileId={linking?.profile_id ?? null}
          volunteer={linking}
          onClose={() => setLinking(null)}
          onSubmitted={() => router.refresh()}
        />
      )}

      {/* Delete modal */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="حذف متطوع نهائياً"
        description="سيتم حذف بيانات المتطوع من السجلات ولا يمكن التراجع."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>إلغاء</Button>
            <Button variant="danger" onClick={submitDelete} loading={loading}>حذف نهائي</Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">هل أنت متأكد من حذف <strong>{deleting?.full_name}</strong>؟</p>
      </Modal>

      {/* List */}
      <div className="divide-y divide-slate-50">
        {filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-400">لا توجد نتائج مطابقة.</p>
        )}

        {/* Mobile cards */}
        <div className="grid gap-3 p-4 sm:hidden">
          {filtered.map((v) => (
            <Card key={v.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-slate-800">{v.full_name}</p>
                    {leadershipOf(v)[0] && (
                      <Badge tone="gold" className="text-[10px]">{leadershipOf(v)[0].label}</Badge>
                    )}
                    {v.status === "inactive" && (
                      <Badge tone="slate" className="text-[10px]">{volunteerStatusLabels.inactive}</Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">
                    {v.committees.length ? v.committees.map((c) => c.name).join(" · ") : "بدون لجنة"}
                    {v.phone ? ` · ${v.phone}` : ""}
                  </p>
                </div>
                <Link href={v.profile_id ? `/volunteers/${v.profile_id}` : `/volunteers/v/${v.id}`} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-700">
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              </div>
              {(canEdit(v) || (canDelete && v.status === "inactive")) && (
                <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2">
                  {canEdit(v) && (
                    <button onClick={() => setEditing(v)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700" title="تعديل">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {canManage && (
                    <button onClick={() => setAssigning(v)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700" title="تعيين اللجان">
                      <Layers className="h-4 w-4" />
                    </button>
                  )}
                  {canManage && (
                    <button onClick={() => toggleStatus(v)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700" title={v.status === "active" ? "إيقاف" : "تفعيل"}>
                      {v.status === "active" ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => setDeleting(v)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="حذف">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-right text-xs font-semibold text-slate-400">
                <th className="px-5 py-3">الاسم</th>
                <th className="px-5 py-3">اللجان</th>
                <th className="px-5 py-3">الدور</th>
                <th className="px-5 py-3">الحالة</th>
                <th className="px-5 py-3">الهاتف</th>
                <th className="px-5 py-3 text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((v) => (
                <tr key={v.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={v.profile_id ? `/volunteers/${v.profile_id}` : `/volunteers/v/${v.id}`} className="font-bold text-slate-800 hover:text-brand-700">
                      {v.full_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    {v.committees.length ? (
                      <div className="flex flex-wrap gap-1">
                        {v.committees.map((c) => (
                          <Badge key={c.id} tone="teal" className="text-[10px]">{c.name}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">بدون لجنة</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {leadershipOf(v).map((l, i) => (
                      <Badge key={i} tone={l.isDeputy ? "blue" : "gold"} className="mr-1 text-[10px]">
                        {l.committeeName ? `${l.label} · ${l.committeeName}` : l.label}
                      </Badge>
                    ))}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={v.status === "active" ? "green" : "slate"} className="text-[10px]">
                      {volunteerStatusLabels[v.status]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500" dir="ltr">{v.phone || "—"}</td>
                  <td className="px-5 py-3 text-left">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={v.profile_id ? `/volunteers/${v.profile_id}` : `/volunteers/v/${v.id}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-700" title="عرض">
                        <ChevronLeft className="h-4 w-4" />
                      </Link>
                      {canEdit(v) && (
                        <button onClick={() => setEditing(v)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700" title="تعديل">
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => setAssigning(v)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700" title="تعيين اللجان">
                          <Layers className="h-4 w-4" />
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => toggleStatus(v)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700" title={v.status === "active" ? "إيقاف" : "تفعيل"}>
                          {v.status === "active" ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </button>
                      )}
                      {canLink && v.profile_id === null && (
                        <button onClick={() => setLinking(v)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700" title="ربط الحساب">
                          <Link2 className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && !v.leadership.length && (
                        <button onClick={() => setDeleting(v)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="حذف">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}