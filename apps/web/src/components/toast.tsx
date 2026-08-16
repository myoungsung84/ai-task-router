"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/format";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  showToast: (tone: ToastTone, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-brand",
};

const TONE_ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4" aria-hidden />,
  error: <AlertTriangle className="h-4 w-4" aria-hidden />,
  info: <Info className="h-4 w-4" aria-hidden />,
};

/**
 * Minimal global toast stack for action feedback (cancel/delete/start
 * succeeded or failed) — not a replacement for inline form-validation
 * errors, which stay next to the field they describe.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((tone: ToastTone, message: string) => {
    const id = String(nextId.current++);
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "animate-fade-in-up pointer-events-auto flex items-start gap-2 rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm shadow-lg",
              TONE_CLASS[t.tone],
            )}
          >
            <span aria-hidden className="mt-0.5">
              {TONE_ICON[t.tone]}
            </span>
            <span className="flex-1 text-fg-secondary">{t.message}</span>
            <button
              aria-label="닫기"
              className="text-fg-faint transition-colors hover:text-fg"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Falls back to a no-op if used outside the provider, so it's never a hard crash risk during incremental adoption. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { showToast: () => {} };
  }
  return ctx;
}
