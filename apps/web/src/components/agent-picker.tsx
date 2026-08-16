"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/format";
import { AgentAvatar } from "./agent-icon";
import type { AgentName } from "@/features/tasks/types";
import { AGENT_LABEL, AGENT_BLURB } from "@/features/tasks/workflow-labels";

/**
 * Two equal-width, equal-height Claude/Codex options — the AI half of a
 * Settings role editor and of a per-task override. Both halves are the same
 * button with the same padding and the same hit area, so neither reads as
 * the "default" one by size alone. Selection is a border plus a checkmark,
 * not a heavy tinted block: the point is to mark a choice, not to repaint
 * the panel.
 */
export function AgentPicker({
  value,
  onChange,
  size = "md",
}: {
  value: AgentName;
  onChange: (agent: AgentName) => void;
  size?: "sm" | "md";
}) {
  const agents: AgentName[] = ["claude", "codex"];
  return (
    <div className="grid grid-cols-2 gap-2">
      {agents.map((a) => {
        const selected = value === a;
        return (
          <button
            key={a}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(a)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md border p-3 text-left transition-colors duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              selected
                ? "border-brand/60 bg-brand/[0.06]"
                : "border-border bg-transparent hover:border-border-strong hover:bg-fg/[0.03]",
            )}
          >
            <AgentAvatar agent={a} size={size === "sm" ? "sm" : "md"} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-fg">{AGENT_LABEL[a]}</span>
                {selected ? <Check className="h-3.5 w-3.5 text-brand" aria-hidden /> : null}
              </span>
              {size === "md" ? (
                <span className="mt-0.5 block text-xs leading-snug text-fg-muted">
                  {AGENT_BLURB[a]}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
