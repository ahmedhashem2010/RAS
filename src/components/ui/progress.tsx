import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  barClassName,
  color,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  color?: string;
}) {
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", barClassName)}
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          backgroundColor: color ?? undefined,
        }}
      />
    </div>
  );
}

export function ScoreRing({
  value,
  size = 120,
  stroke = 10,
  color = "#0d9488",
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-extrabold" style={{ fontSize: size / 4.5 }}>
          {clamped}
        </span>
        <span className="text-[10px] font-medium text-slate-500">
          {label ?? "من 100"}
        </span>
      </div>
    </div>
  );
}
