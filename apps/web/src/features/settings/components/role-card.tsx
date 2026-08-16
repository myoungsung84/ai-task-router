"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/format";
import { AgentAvatar } from "@/components/agent-icon";
import { AgentPicker } from "@/components/agent-picker";
import { ModelPicker } from "@/components/model-picker";
import { FieldLabel } from "@/components/field";
import { defaultModelForAgent, findModelOption } from "@/lib/model-catalog";
import {
  AGENT_LABEL,
  TASK_ROLE_DESCRIPTION,
  TASK_ROLE_LABEL,
} from "@/features/tasks/workflow-labels";
import type { RoleConfig, TaskRole } from "@/features/tasks/types";

/**
 * One role as a single row in the settings list. Collapsed, it is a fixed
 * three-part line — role, what that role does, and the AI + model currently
 * assigned in a column of its own — so the three roles can be compared
 * straight down that column instead of being read one paragraph at a time.
 * Expanded, the editor opens *inside* the same row, and which row (if any)
 * is open is owned by the parent, so at most one editor exists at a time
 * and the rows below shift by one panel's height rather than three.
 */
export function RoleCard({
  role,
  value,
  onChange,
  expanded,
  onToggle,
  note,
}: {
  role: TaskRole;
  value: RoleConfig;
  onChange: (next: RoleConfig) => void;
  expanded: boolean;
  onToggle: () => void;
  /** Optional one-line relationship note shown under the role name, e.g. "구현 완료 후 실행". */
  note?: string;
}) {
  // The catalog now carries an explicit `null` → "자동 선택" entry for both
  // agents, so this summary and the expanded ModelPicker below resolve the
  // exact same stored value through the exact same lookup. The remaining
  // fallback is only for a hand-typed model id, which has no catalog label.
  const modelLabel = findModelOption(value.agent, value.model)?.label ?? value.model ?? "자동 선택";

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-fast",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
          expanded ? "bg-fg/[0.03]" : "hover:bg-fg/[0.03]",
        )}
      >
        <AgentAvatar agent={value.agent} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">
            {TASK_ROLE_LABEL[role]}
            {note ? <span className="ml-2 text-xs font-normal text-fg-muted">{note}</span> : null}
          </span>
          <span className="mt-0.5 block text-xs text-fg-muted">{TASK_ROLE_DESCRIPTION[role]}</span>
        </span>
        <span className="hidden w-40 shrink-0 items-baseline gap-2 sm:flex">
          <span className="text-sm text-fg">{AGENT_LABEL[value.agent]}</span>
          <span className="truncate text-xs text-fg-muted">{modelLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-fg-muted transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {expanded ? (
        /* Stacked, not side-by-side: on a wide screen this list already sits
           in the narrower of the settings page's two columns, and squeezing
           the two-card AI picker next to the model row there would leave
           both cramped. Vertical space is the cheap axis here — the adjacent
           column absorbs the height. */
        <div className="space-y-4 border-t border-border bg-fg/[0.02] px-4 py-4">
          <div>
            <FieldLabel className="mb-2">담당 AI</FieldLabel>
            <AgentPicker
              value={value.agent}
              onChange={(agent) => {
                // A model value from the previous AI (e.g. Claude's
                // "sonnet") means nothing to the other one — carrying it
                // over would send it straight through to the CLI as-is.
                if (agent !== value.agent) onChange({ agent, model: defaultModelForAgent(agent) });
              }}
            />
          </div>
          <div>
            <FieldLabel className="mb-2">모델</FieldLabel>
            <ModelPicker
              agent={value.agent}
              value={value.model ?? null}
              onChange={(model) => onChange({ ...value, model })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
