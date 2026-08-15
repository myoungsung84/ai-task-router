"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  success: "border-emerald-500/40 bg-emerald-950/40 text-emerald-200",
  error: "border-red-500/40 bg-red-950/40 text-red-200",
  info: "border-blue-500/40 bg-blue-950/40 text-blue-200",
};

const TONE_ICON: Record<ToastTone, string> = { success: "✓", error: "✕", info: "ℹ" };

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
              "pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-lg backdrop-blur-sm",
              TONE_CLASS[t.tone],
            )}
          >
            <span aria-hidden>{TONE_ICON[t.tone]}</span>
            <span className="flex-1">{t.message}</span>
            <button
              aria-label="닫기"
              className="text-xs opacity-70 hover:opacity-100"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            >
              ✕
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
