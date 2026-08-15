import { cn } from "@/lib/format";
import { ACTION_LABEL, AGENT_ICON, AGENT_LABEL, STEP_STATUS_LABEL } from "../workflow-labels";
import type { Workflow, WorkflowStep } from "../types";

const CARD_CLASS: Record<WorkflowStep["status"], string> = {
  PENDING: "border-[#232c38] bg-transparent text-[#8291a3]",
  RUNNING: "border-blue-500/50 bg-blue-600/10 text-white",
  SUCCESS: "border-emerald-500/40 bg-emerald-600/10 text-emerald-200",
  SKIPPED: "border-zinc-600/40 bg-zinc-600/10 text-zinc-400",
  FAILED: "border-red-500/40 bg-red-600/10 text-red-200",
  CANCELLED: "border-zinc-600/40 bg-zinc-600/10 text-zinc-400",
};

const STATUS_ICON: Record<WorkflowStep["status"], string> = {
  PENDING: "○",
  RUNNING: "●",
  SUCCESS: "✓",
  SKIPPED: "⏭",
  FAILED: "✕",
  CANCELLED: "⏹",
};

/** Ordered Step-by-Step view of a Task's workflow — used in Task Detail (full) and, in compact form, on running-task cards. */
export function WorkflowTimeline({
  workflow,
  compact = false,
}: {
  workflow: Workflow;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", compact ? "gap-1" : "gap-2")}>
      {workflow.steps.map((step, i) => (
        <div key={step.id}>
          <div
            className={cn(
              "rounded-md border px-3 py-2",
              CARD_CLASS[step.status],
              step.status === "RUNNING" && "motion-safe:animate-pulse",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span aria-hidden>{AGENT_ICON[step.agent]}</span>
                <span className="font-medium">{AGENT_LABEL[step.agent]}</span>
                <span className="text-[#8291a3]">{ACTION_LABEL[step.action]}</span>
                {step.permission === "write" ? (
                  <span className="mono text-[10px] uppercase tracking-wide text-[#8291a3]">
                    write
                  </span>
                ) : (
                  <span className="mono text-[10px] uppercase tracking-wide text-[#8291a3]">
                    read-only
                  </span>
                )}
              </div>
              <span className="flex items-center gap-1 text-xs">
                <span aria-hidden>{STATUS_ICON[step.status]}</span>
                {STEP_STATUS_LABEL[step.status]}
                {step.skipReason === "NO_CHANGES" ? (
                  <span className="text-[#8291a3]">(변경 없음)</span>
                ) : null}
              </span>
            </div>
            {step.result?.review ? (
              <div className="mt-1 text-xs text-[#8291a3]">
                리뷰:{" "}
                <span
                  className={
                    step.result.review.result === "WARNING" ? "text-amber-300" : "text-emerald-300"
                  }
                >
                  {step.result.review.result}
                </span>
                {step.result.review.issues.length ? ` (${step.result.review.issues.length}건)` : ""}
              </div>
            ) : null}
            {step.error ? <div className="mt-1 text-xs text-red-300">{step.error}</div> : null}
          </div>
          {i < workflow.steps.length - 1 ? (
            <div className="flex justify-center py-0.5 text-[#546274]">↓</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
