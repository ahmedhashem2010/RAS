"use client";

import * as React from "react";
import Link from "next/link";
import { Search, ShieldAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { roleLabels } from "@/lib/i18n";
import type { Profile } from "@/lib/types";

interface Row extends Profile {
  warnings: number;
  score: number | null;
  teams: string[];
}

export function VolunteersList({
  rows,
  currentUserId,
  warningLimit,
}: {
  rows: Row[];
  currentUserId: string;
  warningLimit: number;
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "active" | "banned" | "admin">("all");

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      r.full_name.toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q);
    const matchesFilter =
      filter === "all" ||
      (filter === "admin" && r.role !== "volunteer") ||
      r.status === filter;
    return matchesQuery && matchesFilter;
  });

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالاسم أو البريد..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-9 pl-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <div className="flex gap-2">
          {(
            [
              ["all", "الكل"],
              ["active", "نشط"],
              ["banned", "محظور"],
              ["admin", "الإداريون"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === key
                  ? "bg-brand-700 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-slate-50">
        {filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            لا توجد نتائج مطابقة.
          </p>
        )}
        {filtered.map((r) => (
          <Link
            key={r.id}
            href={`/volunteers/${r.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:px-5"
          >
            <Avatar name={r.full_name} src={r.avatar_url} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-bold text-slate-800">
                  {r.full_name}
                  {r.id === currentUserId && (
                    <span className="mr-1 text-xs font-semibold text-brand-600">(أنت)</span>
                  )}
                </p>
                {r.role !== "volunteer" && (
                  <Badge tone="gold" className="text-[10px]">{roleLabels[r.role]}</Badge>
                )}
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-400">
                {r.teams.length > 0 ? r.teams.join(" · ") : "بدون فريق"}
                {r.email ? ` · ${r.email}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {r.warnings > 0 && (
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${r.warnings >= warningLimit ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                  <ShieldAlert className="h-3 w-3" />
                  {r.warnings}/{warningLimit}
                </span>
              )}
              {r.score !== null && (
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-extrabold text-brand-700">
                  {r.score}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
