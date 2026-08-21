"use client";

import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

export function StarRating({
  value,
  onChange,
  size = "md",
  readOnly,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
  readOnly?: boolean;
}) {
  const sizes = { sm: "h-4 w-4", md: "h-7 w-7", lg: "h-10 w-10" };
  return (
    <div className="flex items-center gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(i)}
          className={cn(
            "transition-transform",
            !readOnly && "cursor-pointer hover:scale-110 active:scale-95",
            readOnly && "cursor-default",
          )}
          aria-label={`${i} من 5`}
        >
          <Star
            className={cn(
              sizes[size],
              i <= value
                ? "fill-gold-400 text-gold-400"
                : "fill-slate-100 text-slate-200",
            )}
          />
        </button>
      ))}
    </div>
  );
}
