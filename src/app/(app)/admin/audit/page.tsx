import { ScrollText } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";

const actionMeta: Record<string, { label: string; tone: "teal" | "blue" | "gold" | "red" | "slate" | "green" | "amber" }> = {
  user_created: { label: "إنشاء مستخدم", tone: "green" },
  user_banned: { label: "حظر مستخدم", tone: "red" },
  user_unbanned: { label: "إعادة تفعيل", tone: "green" },
  user_role_changed: { label: "تغيير دور", tone: "amber" },
  award_created: { label: "إضافة جائزة", tone: "gold" },
  award_deleted: { label: "حذف جائزة", tone: "red" },
  warning_issued: { label: "إصدار إنذار", tone: "red" },
  warning_deleted: { label: "حذف إنذار", tone: "slate" },
  settings_updated: { label: "تحديث الإعدادات", tone: "blue" },
  profile_updated: { label: "تحديث بيانات", tone: "teal" },
  team_created: { label: "إنشاء مجموعة", tone: "green" },
  team_updated: { label: "تحديث مجموعة", tone: "teal" },
  team_deleted: { label: "حذف مجموعة", tone: "red" },
  member_added: { label: "إضافة عضو", tone: "green" },
  member_removed: { label: "إزالة عضو", tone: "red" },
  member_left_team: { label: "مغادرة عضو للمجموعة", tone: "slate" },
  leader_assigned: { label: "تعيين قائد", tone: "gold" },
  leader_removed: { label: "إزالة قائد", tone: "amber" },
  convoy_created: { label: "إنشاء قافلة", tone: "green" },
  convoy_updated: { label: "تحديث قافلة", tone: "teal" },
  convoy_status_changed: { label: "تغيير حالة قافلة", tone: "amber" },
  convoy_deleted: { label: "حذف قافلة", tone: "red" },
  attendance_changed: { label: "تعديل حضور", tone: "blue" },
  rating_created: { label: "إضافة تقييم", tone: "teal" },
  rating_updated: { label: "تحديث تقييم", tone: "amber" },
  task_created: { label: "إنشاء مهمة", tone: "green" },
  task_updated: { label: "تحديث مهمة", tone: "teal" },
  task_deleted: { label: "حذف مهمة", tone: "red" },
  task_reviewed: { label: "مراجعة مهمة", tone: "blue" },
  task_reopened: { label: "إعادة فتح مهمة", tone: "amber" },
};

export default async function AdminAuditPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action, target_type, target_id, metadata, created_at, actor_id")
    .order("created_at", { ascending: false })
    .limit(200);

  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter(Boolean))];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: null };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  const rows = logs ?? [];

  return (
    <div>
      <PageHeader
        title="سجل العمليات"
        description="آخر الإجراءات الحساسة التي تمت في النظام"
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="لا توجد عمليات مسجلة بعد"
          description="سيتم تسجيل الإجراءات الحساسة هنا تلقائياً."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-50">
              {rows.map((l) => {
                const meta = actionMeta[l.action] ?? { label: l.action, tone: "slate" as const };
                return (
                  <div key={l.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="text-sm font-semibold text-slate-700">
                          {actorName.get(l.actor_id ?? "") ?? "مستخدم"}
                        </span>
                      </div>
                      {l.metadata && Object.keys(l.metadata).length > 0 && (
                        <p className="mt-1 truncate text-xs text-slate-400" dir="ltr">
                          {JSON.stringify(l.metadata)}
                        </p>
                      )}
                      {l.target_id && (
                        <p className="mt-1 truncate text-[11px] text-slate-400" dir="ltr">
                          {l.target_type}: {l.target_id}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDateTime(l.created_at)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
