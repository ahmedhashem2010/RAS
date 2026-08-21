"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartHandshake, LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { getNavItems } from "@/lib/nav";
import { appName, appSubtitle } from "@/lib/i18n";
import type { SessionUser } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { roleLabels } from "@/lib/i18n";

export function Sidebar({ user }: { user: SessionUser & { profile: { full_name: string; avatar_url: string | null } } }) {
  const pathname = usePathname();
  const items = getNavItems(user);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 flex-col border-l border-slate-200 bg-white lg:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 shadow-sm">
          <HeartHandshake className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-lg font-extrabold leading-none text-slate-900">{appName}</p>
          <p className="mt-1 text-[9px] font-semibold tracking-wide text-slate-400">
            {appSubtitle}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors",
                active
                  ? "bg-brand-50 text-brand-800"
                  : "hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <item.icon className={cn("h-5 w-5", active && "text-brand-700")} />
              <span className="flex-1">{item.label}</span>
              {item.super && <Badge tone="gold" className="text-[10px]">مدير</Badge>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.profile.full_name} src={user.profile.avatar_url} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800">
              {user.profile.full_name}
            </p>
            <Badge tone="teal" className="mt-0.5 text-[10px]">
              {roleLabels[user.role] ?? user.role}
            </Badge>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
              title="تسجيل الخروج"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
