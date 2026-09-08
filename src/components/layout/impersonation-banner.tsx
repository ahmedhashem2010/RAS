"use client";

import { stopImpersonation } from "@/lib/actions/impersonate";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { ShieldOff } from "lucide-react";

export function ImpersonationBanner({
  leaderName,
  committeeName,
}: {
  leaderName: string;
  committeeName: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function onStop() {
    startTransition(async () => {
      const res = await stopImpersonation();
      if (res?.warning) {
        toast("warning", res.warning);
      }
      router.push("/dashboard");
    });
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-800">
      <div className="flex items-center justify-center gap-3">
        <ShieldOff className="h-4 w-4 text-amber-600" />
        <span>
          أنت تستعرض واجهة <strong>{leaderName}</strong> — لجنة{" "}
          <strong>{committeeName}</strong>
        </span>
        <button
          disabled={pending}
          onClick={onStop}
          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? "جاري الإنهاء..." : "إنهاء العرض"}
        </button>
      </div>
    </div>
  );
}