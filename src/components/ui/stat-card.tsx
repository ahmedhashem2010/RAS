import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "teal",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "teal" | "blue" | "gold" | "red" | "slate";
  className?: string;
}) {
  const tones = {
    teal: "bg-brand-50 text-brand-700",
    blue: "bg-blue-50 text-blue-700",
    gold: "bg-amber-50 text-gold-600",
    red: "bg-red-50 text-red-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          tones[tone],
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="text-xl font-extrabold text-slate-900">{value}</p>
        {hint && <p className="truncate text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}
