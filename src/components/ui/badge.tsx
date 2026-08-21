import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "teal" | "blue" | "gold" | "red" | "slate" | "green" | "amber";

const tones: Record<Tone, string> = {
  teal: "bg-brand-50 text-brand-700 ring-brand-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  gold: "bg-amber-50 text-gold-600 ring-gold-500/30",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-100 text-amber-800 ring-amber-600/20",
};

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, Tone> = {
    present: "green",
    active: "green",
    upcoming: "blue",
    approved: "green",
    in_progress: "blue",
    submitted: "amber",
    completed: "green",
    excused: "amber",
    accepted: "teal",
    rejected: "red",
    cancelled: "red",
    banned: "red",
    absent: "red",
    pending: "slate",
    normal: "teal",
    mini_camp: "blue",
    full_camp: "gold",
  };
  return <Badge tone={map[status] ?? "slate"}>{status}</Badge>;
}
