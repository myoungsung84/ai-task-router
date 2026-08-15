"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function Dialog({
  open,
  onClose,
  title,
  children,
  maxWidthClassName = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[5vh]">
      <button
        aria-label="닫기"
        className="fixed inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full rounded-lg border border-[#232c38] bg-[#121821] shadow-2xl",
          maxWidthClassName,
        )}
      >
        <div className="flex items-center justify-between border-b border-[#232c38] px-4 py-3">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md px-2 py-1 text-[#8291a3] hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[88vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
