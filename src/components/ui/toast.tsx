"use client";

import * as React from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

const ToastContext = React.createContext<{
  toast: (kind: ToastKind, title: string, description?: string) => void;
}>({ toast: () => {} });

export function useToast() {
  return React.useContext(ToastContext);
}

const icons: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
  error: <XCircle className="h-5 w-5 text-red-500" />,
  info: <Info className="h-5 w-5 text-brand-600" />,
  warning: <AlertTriangle className="h-5 w-5 text-gold-500" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const remove = React.useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = React.useCallback(
    (kind: ToastKind, title: string, description?: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, title, description }]);
      setTimeout(() => remove(id), 5000);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm animate-fade-in-up items-start gap-3 rounded-xl border bg-white p-4 shadow-card-hover",
              t.kind === "success" && "border-emerald-100",
              t.kind === "error" && "border-red-100",
              t.kind === "info" && "border-brand-100",
              t.kind === "warning" && "border-amber-100",
            )}
          >
            {icons[t.kind]}
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-sm text-slate-500">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => remove(t.id)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
