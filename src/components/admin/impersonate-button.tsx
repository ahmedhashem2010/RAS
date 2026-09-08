"use client";

import { startImpersonation } from "@/lib/actions/impersonate";
import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { Eye } from "lucide-react";

export function ImpersonateButton({
  profileId,
  committeeId,
  committeeName,
}: {
  profileId: string;
  committeeId: string;
  committeeName: string;
}) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function onClick() {
    startTransition(async () => {
      const res = await startImpersonation(profileId, committeeId);
      if (res?.ok === false && res.error) {
        toast("error", res.error);
      } else if (res?.warning) {
        toast("warning", res.warning);
      }
    });
  }

  return (
    <button
      disabled={pending}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
      title={`عرض واجهة قائد لجنة ${committeeName}`}
    >
      <Eye className="h-3.5 w-3.5" />
      <span>{pending ? "..." : committeeName}</span>
    </button>
  );
}