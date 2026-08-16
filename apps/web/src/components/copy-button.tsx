"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/format";

type CopyState = "idle" | "copied" | "failed";

/**
 * Small inline copy-to-clipboard button. Renders nothing when `text` is
 * empty/whitespace-only — callers can pass a possibly-empty value directly
 * instead of guarding at every call site ("빈 값에는 불필요한 버튼을 표시하지 마세요").
 * Feedback is inline (label swaps to 복사됨/복사 실패 for ~1.6s) so it reads
 * correctly no matter where the button is placed.
 */
export function CopyButton({
  text,
  label = "복사",
  className,
}: {
  text: string | null | undefined;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  if (!text || !text.trim()) return null;

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text!);
      setState("copied");
    } catch {
      setState("failed");
    } finally {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setState("idle"), 1600);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        state === "copied"
          ? "bg-success/10 text-success"
          : state === "failed"
            ? "bg-danger/10 text-danger"
            : "bg-fg/[0.06] text-fg-muted hover:bg-fg/[0.1] hover:text-fg",
        className,
      )}
    >
      {state === "copied" ? (
        <>
          <Check className="h-3 w-3" aria-hidden /> 복사됨
        </>
      ) : state === "failed" ? (
        <>
          <X className="h-3 w-3" aria-hidden /> 복사 실패
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" aria-hidden /> {label}
        </>
      )}
    </button>
  );
}
