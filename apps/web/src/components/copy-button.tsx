"use client";

import { useEffect, useRef, useState } from "react";
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
        "inline-flex items-center gap-1 rounded-md border border-[#232c38] px-2 py-1 text-xs transition-colors",
        state === "copied"
          ? "border-emerald-500/40 text-emerald-300"
          : state === "failed"
            ? "border-red-500/40 text-red-300"
            : "text-[#8291a3] hover:border-[#33404f] hover:text-white",
        className,
      )}
    >
      {state === "copied" ? "✓ 복사됨" : state === "failed" ? "✕ 복사 실패" : `⧉ ${label}`}
    </button>
  );
}
