"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

/**
 * An underlined tab strip, not a pill segmented control — these switch
 * between *views of the same record* (review / diff / logs on one Task), the
 * document-tab semantic, and the underline keeps the tab row on the same
 * left baseline as the content beneath it instead of floating a rounded
 * capsule above it. Uncontrolled by default (`defaultValue`, internal
 * state) — pass `value`/`onValueChange` to control the active tab from
 * outside (used by TaskDetail so a review callout's "전체 리뷰" button can
 * jump to the review tab).
 */
export function Tabs({
  tabs,
  defaultValue,
  value,
  onValueChange,
}: {
  tabs: { value: string; label: string; badge?: ReactNode; content: ReactNode }[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const [internalActive, setInternalActive] = useState(defaultValue ?? tabs[0]?.value);
  const active = value ?? internalActive;
  const setActive = onValueChange ?? setInternalActive;
  return (
    <div>
      <div role="tablist" className="flex gap-6 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active === t.value}
            onClick={() => setActive(t.value)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              active === t.value
                ? "border-brand text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.badge}
          </button>
        ))}
      </div>
      <div className="pt-6">{tabs.find((t) => t.value === active)?.content}</div>
    </div>
  );
}
