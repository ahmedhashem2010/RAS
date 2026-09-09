"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mobilePrimaryItems } from "@/lib/nav";
import type { SessionUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MobileNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const items = mobilePrimaryItems(user);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="flex items-stretch">
        {items.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-slate-500 transition-colors",
                active && "text-brand-700",
              )}
            >
              <item.icon className={cn("h-5 w-5", active && "text-brand-700")} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
