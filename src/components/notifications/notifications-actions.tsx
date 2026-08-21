"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Trash2 } from "lucide-react";
import {
  markAllNotificationsRead,
  clearNotifications,
} from "@/lib/actions/notifications";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function NotificationsActions({ mode }: { mode: "read" | "clear" }) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function run() {
    setLoading(true);
    const res = mode === "read" ? await markAllNotificationsRead() : await clearNotifications();
    setLoading(false);
    if (!res.ok) return toast("error", "حدث خطأ", res.error);
    toast("success", mode === "read" ? "تم تحديد الكل كمقروء" : "تم حذف الإشعارات");
    router.refresh();
  }

  if (mode === "read") {
    return (
      <Button variant="secondary" size="sm" onClick={run} loading={loading}>
        <CheckCheck className="h-4 w-4" />
        تحديد الكل كمقروء
      </Button>
    );
  }
  return (
    <Button variant="danger" size="sm" onClick={run} loading={loading}>
      <Trash2 className="h-4 w-4" />
      مسح الإشعارات
    </Button>
  );
}
