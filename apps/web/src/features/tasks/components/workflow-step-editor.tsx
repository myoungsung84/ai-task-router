"use client";

import { Button } from "@/components/button";
import { ACTION_LABEL, AGENT_LABEL } from "../workflow-labels";
import type { AgentName, StepAction, StepPermission, WorkflowStepSpec } from "../types";

const AGENTS: AgentName[] = ["claude", "codex"];
const ACTIONS: StepAction[] = ["implement", "analyze", "review"];
const PERMISSIONS: StepPermission[] = ["write", "read-only"];

const selectClass =
  "rounded-md border border-[#232c38] bg-[#0e131a] px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none";

/**
 * Add/remove/reorder/agent/action/permission editor for a WorkflowStepSpec[].
 * Up/down buttons rather than drag & drop — simpler, no extra dependency,
 * fully keyboard-usable.
 */
export function WorkflowStepEditor({
  steps,
  onChange,
}: {
  steps: WorkflowStepSpec[];
  onChange: (steps: WorkflowStepSpec[]) => void;
}) {
  function update(i: number, patch: Partial<WorkflowStepSpec>) {
    onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }
  function remove(i: number) {
    onChange(steps.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...steps, { agent: "claude", action: "implement", permission: "write" }]);
  }

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i}>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#232c38] bg-[#0e131a] px-3 py-2">
            <span className="mono w-5 text-xs text-[#546274]">{i + 1}.</span>
            <select
              className={selectClass}
              value={step.agent}
              onChange={(e) => update(i, { agent: e.target.value as AgentName })}
            >
              {AGENTS.map((a) => (
                <option key={a} value={a}>
                  {AGENT_LABEL[a]}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={step.action}
              onChange={(e) => update(i, { action: e.target.value as StepAction })}
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={step.permission}
              onChange={(e) => update(i, { permission: e.target.value as StepPermission })}
            >
              {PERMISSIONS.map((p) => (
                <option key={p} value={p}>
                  {p === "write" ? "Write" : "Read Only"}
                </option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="위로 이동"
                className="rounded px-1.5 py-1 text-[#8291a3] hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === steps.length - 1}
                aria-label="아래로 이동"
                className="rounded px-1.5 py-1 text-[#8291a3] hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={steps.length <= 1}
                aria-label="Step 삭제"
                className="rounded px-1.5 py-1 text-red-400 hover:bg-red-500/10 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          </div>
          {i < steps.length - 1 ? (
            <div className="flex justify-center py-0.5 text-[#546274]">↓</div>
          ) : null}
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={add}>
        + Step 추가
      </Button>
    </div>
  );
}
