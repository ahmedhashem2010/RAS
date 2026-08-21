"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";

export function AccountBannedActions() {
  return (
    <button
      type="button"
      onClick={() => logoutAction()}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
    >
      <LogOut className="h-4 w-4" />
      تسجيل الخروج
    </button>
  );
}
