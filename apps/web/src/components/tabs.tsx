"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

/**
 * Uncontrolled by default (`defaultValue`, internal state) — pass
 * `value`/`onValueChange` to control the active tab from outside (used by
 * TaskDetail so the WARNING banner's "리뷰 보기" button can jump to the
 * review tab).
 */
export function Tabs({
  tabs,
  defaultValue,
  value,
  onValueChange,
}: {
  tabs: { value: string; label: string; content: ReactNode }[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const [internalActive, setInternalActive] = useState(defaultValue ?? tabs[0]?.value);
  const active = value ?? internalActive;
  const setActive = onValueChange ?? setInternalActive;
  return (
    <div>
      <div className="flex gap-1 border-b border-[#232c38]">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setActive(t.value)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active === t.value
                ? "border-blue-500 text-white"
                : "border-transparent text-[#8291a3] hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{tabs.find((t) => t.value === active)?.content}</div>
    </div>
  );
}
