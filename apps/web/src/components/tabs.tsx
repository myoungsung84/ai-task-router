"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

export function Tabs({
  tabs,
  defaultValue,
}: {
  tabs: { value: string; label: string; content: ReactNode }[];
  defaultValue?: string;
}) {
  const [active, setActive] = useState(defaultValue ?? tabs[0]?.value);
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
