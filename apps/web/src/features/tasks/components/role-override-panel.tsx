"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/format";
import { AgentPicker } from "@/components/agent-picker";
import { ModelPicker } from "@/components/model-picker";
import { FieldLabel } from "@/components/field";
import { defaultModelForAgent } from "@/lib/model-catalog";
import { TASK_ROLE_LABEL } from "../workflow-labels";
import { rolesForPurpose } from "../types";
import type { RoleOverride, RoleSettings, TaskPurpose, TaskRole } from "../types";

export type RoleOverrideMap = Partial<Record<TaskRole, RoleOverride>>;

/**
 * Most tasks should just use the defaults configured in 설정 (already
 * previewed on the 작업 유형 options above), so this stays collapsed to a
 * single row until someone actually wants to change who does the work for
 * one task. Expanding it grows the form downward at the same width and the
 * same left edge as every field above — no indented sub-panel, no floating
 * box — so the flow of the dialog is unchanged whether it's open or shut.
 * Only a role actually touched here is sent as an override (see
 * TaskCreateForm), so leaving it closed is identical to it not existing.
 */
export function RoleOverridePanel({
  purpose,
  roles,
  overrides,
  onChange,
}: {
  purpose: TaskPurpose;
  roles: RoleSettings;
  overrides: RoleOverrideMap;
  onChange: (overrides: RoleOverrideMap) => void;
}) {
  const [open, setOpen] = useState(false);
  const involvedRoles = rolesForPurpose(purpose);
  const overrideCount = involvedRoles.filter((r) => overrides[r]).length;

  function effective(role: TaskRole) {
    return { ...roles[role], ...overrides[role] };
  }

  function setOverride(role: TaskRole, patch: RoleOverride) {
    onChange({ ...overrides, [role]: { ...overrides[role], ...patch } });
  }

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left transition-colors duration-fast hover:bg-fg/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="text-sm font-medium text-fg-secondary">담당 AI 변경</span>
        {overrideCount > 0 ? (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            {overrideCount}
          </span>
        ) : (
          <span className="text-xs text-fg-muted">설정의 기본값 사용</span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-fg-muted transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-5 border-t border-border px-3 py-4">
          {involvedRoles.map((role) => (
            <div key={role} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>{TASK_ROLE_LABEL[role]}</FieldLabel>
                {overrides[role] ? (
                  <button
                    type="button"
                    className="text-xs text-fg-muted transition-colors hover:text-fg"
                    onClick={() => {
                      const next = { ...overrides };
                      delete next[role];
                      onChange(next);
                    }}
                  >
                    기본값으로 되돌리기
                  </button>
                ) : null}
              </div>
              <AgentPicker
                size="sm"
                value={effective(role).agent}
                onChange={(agent) => {
                  // A model value carried over from the previous AI (e.g.
                  // Claude's "sonnet") is meaningless to the other one —
                  // reset it to that AI's own recommended default rather
                  // than sending it through unchanged.
                  if (agent !== effective(role).agent) {
                    setOverride(role, { agent, model: defaultModelForAgent(agent) });
                  }
                }}
              />
              <ModelPicker
                agent={effective(role).agent}
                value={effective(role).model ?? null}
                onChange={(model) => setOverride(role, { model })}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
