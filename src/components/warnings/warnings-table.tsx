"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteWarning } from "@/lib/actions/warnings";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

interface WarningRow {
  id: string;
  number: number;
  reason: string;
  warning_date: string;
  volunteer_id: string;
  volunteer_name: string;
  volunteer_avatar: string | null;
  issued_by_name: string;
}

export function WarningsTable({ rows }: { rows: WarningRow[] }) {
  const { toast } = useToast();
  const router = useRouter();

  async function remove(id: string) {
    if (!confirm("هل أنت متأكد من حذف هذا الإنذار؟")) return;
    const res = await deleteWarning(id);
    if (!res.ok) return toast("error", "حدث خطأ", res.error);
    toast("success", "تم حذف الإنذار");
    router.refresh();
  }

  return (
    <div className="divide-y divide-slate-50">
      {rows.map((w) => (
        <div key={w.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
          <Avatar name={w.volunteer_name} src={w.volunteer_avatar} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="red">إنذار رقم {w.number}</Badge>
              <Link
                href={`/volunteers/${w.volunteer_id}`}
                className="text-sm font-bold text-slate-800 hover:text-brand-700"
              >
                {w.volunteer_name}
              </Link>
              <span className="text-xs text-slate-400">{formatDate(w.warning_date)}</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-600">{w.reason}</p>
            <p className="mt-1 text-[11px] text-slate-400">صادر بواسطة: {w.issued_by_name}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600"
            onClick={() => remove(w.id)}
            aria-label="حذف الإنذار"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
