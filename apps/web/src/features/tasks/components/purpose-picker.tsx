"use client";

import { ClipboardCheck, Search, Wrench } from "lucide-react";
import { cn } from "@/lib/format";
import { AgentAvatar } from "@/components/agent-icon";
import { AGENT_LABEL, TASK_PURPOSE_DESCRIPTION, TASK_PURPOSE_LABEL } from "../workflow-labels";
import { rolesForPurpose } from "../types";
import type { RoleSettings, TaskPurpose } from "../types";

const PURPOSE_ICON: Record<TaskPurpose, React.ReactNode> = {
  implement: <Wrench className="h-4 w-4" aria-hidden />,
  analyze: <Search className="h-4 w-4" aria-hidden />,
  review: <ClipboardCheck className="h-4 w-4" aria-hidden />,
};

const PURPOSES: TaskPurpose[] = ["implement", "analyze", "review"];

/**
 * Three options with identical structure — icon + name, one description
 * line of matched length, then the AI(s) that will actually run — so the
 * three read as one control rather than three cards that happen to sit in a
 * row. Selection is carried by a border and a filled icon, not a large
 * tinted block: enough to be unambiguous, not enough to repaint a third of
 * the dialog. The AI preview comes from Settings, or from this Task's own
 * overrides once the section below has set any, so "who does this" is never
 * a surprise after submitting.
 */
export function PurposePicker({
  value,
  onChange,
  roles,
}: {
  value: TaskPurpose;
  onChange: (purpose: TaskPurpose) => void;
  roles: RoleSettings;
}) {
  return (
    <div role="radiogroup" aria-label="작업 유형" className="grid gap-2 sm:grid-cols-3">
      {PURPOSES.map((purpose) => {
        const selected = value === purpose;
        const involvedRoles = rolesForPurpose(purpose);
        return (
          <button
            key={purpose}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(purpose)}
            className={cn(
              "flex h-full flex-col gap-2 rounded-md border p-3 text-left transition-colors duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              selected
                ? "border-brand/60 bg-brand/[0.06]"
                : "border-border hover:border-border-strong hover:bg-fg/[0.03]",
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  selected ? "bg-brand/15 text-brand" : "bg-fg/[0.06] text-fg-muted",
                )}
              >
                {PURPOSE_ICON[purpose]}
              </span>
              <span className="text-sm font-medium text-fg">{TASK_PURPOSE_LABEL[purpose]}</span>
            </span>
            <span className="text-xs leading-relaxed text-fg-muted">
              {TASK_PURPOSE_DESCRIPTION[purpose]}
            </span>
            <span className="mt-auto flex items-center gap-1 pt-1">
              {involvedRoles.map((role, i) => (
                <span key={role} className="flex items-center gap-1">
                  {i > 0 ? (
                    <span aria-hidden className="px-0.5 text-fg-faint">
                      →
                    </span>
                  ) : null}
                  <AgentAvatar agent={roles[role].agent} size="sm" />
                  <span className="text-xs text-fg-muted">{AGENT_LABEL[roles[role].agent]}</span>
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
