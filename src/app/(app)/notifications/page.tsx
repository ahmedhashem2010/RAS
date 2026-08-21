import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { NotificationsActions } from "@/components/notifications/notifications-actions";
import { timeAgo } from "@/lib/utils";

const typeTone: Record<string, "teal" | "blue" | "gold" | "red" | "amber" | "green"> = {
  task_assigned: "blue",
  task_approved: "green",
  task_rejected: "red",
  task_submitted: "amber",
  convoy_created: "teal",
  rating_added: "teal",
  award: "gold",
  warning: "red",
  warning_alert: "red",
};

const typeLabel: Record<string, string> = {
  task_assigned: "مهمة",
  task_approved: "قبول",
  task_rejected: "رفض",
  task_submitted: "تسليم",
  convoy_created: "قافلة",
  rating_added: "تقييم",
  award: "جائزة",
  warning: "إنذار",
  warning_alert: "إنذار إداري",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const all = notifications ?? [];
  const unread = all.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="الإشعارات"
        description={unread > 0 ? `${unread} إشعارات غير مقروءة` : "لا توجد إشعارات غير مقروءة"}
        action={
          all.length > 0 ? (
            <NotificationsActions mode={unread > 0 ? "read" : "clear"} />
          ) : undefined
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="لا توجد إشعارات بعد"
          description="سيتم إشعارك عند تكليفك بمهام أو وصول تحديثات."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-50">
              {all.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3.5 sm:px-5 ${n.read ? "" : "bg-brand-50/40"}`}
                >
                  <Badge tone={typeTone[n.type] ?? "slate"} className="mt-1 px-2 py-1 text-[10px]">
                    {typeLabel[n.type] ?? "إشعار"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
