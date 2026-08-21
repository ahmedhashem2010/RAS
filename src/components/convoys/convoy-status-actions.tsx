"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, CheckCircle2, Ban } from "lucide-react";
import { setConvoyStatus } from "@/lib/actions/convoys";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ConvoyStatus } from "@/lib/types";

export function ConvoyStatusActions({
  convoyId,
  status,
}: {
  convoyId: string;
  status: ConvoyStatus;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = React.useState<string | null>(null);

  async function change(next: ConvoyStatus) {
    setLoading(next);
    const res = await setConvoyStatus(convoyId, next);
    setLoading(null);
    if (!res.ok) {
      toast("error", "تعذر تحديث الحالة", res.error);
      return;
    }
    toast("success", "تم تحديث حالة القافلة");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "upcoming" && (
        <Button size="sm" onClick={() => change("active")} loading={loading === "active"}>
          <PlayCircle className="h-4 w-4" />
          بدء القافلة
        </Button>
      )}
      {status === "active" && (
        <Button
          size="sm"
          variant="gold"
          onClick={() => change("completed")}
          loading={loading === "completed"}
        >
          <CheckCircle2 className="h-4 w-4" />
          إنهاء القافلة
        </Button>
      )}
      {(status === "upcoming" || status === "active") && (
        <Button size="sm" variant="danger" onClick={() => change("cancelled")} loading={loading === "cancelled"}>
          <Ban className="h-4 w-4" />
          إلغاء
        </Button>
      )}
      {status === "cancelled" && (
        <Button size="sm" variant="secondary" onClick={() => change("upcoming")} loading={loading === "upcoming"}>
          إعادة فتح
        </Button>
      )}
    </div>
  );
}
