import { cn } from "@/lib/format";
import { ACTION_LABEL, AGENT_ICON, AGENT_LABEL } from "../workflow-labels";
import type { WorkflowStep } from "../types";

const DOT_CLASS: Record<WorkflowStep["status"], string> = {
  PENDING: "bg-[#546274]",
  RUNNING: "bg-blue-400",
  SUCCESS: "bg-emerald-400",
  SKIPPED: "bg-zinc-500",
  FAILED: "bg-red-400",
  CANCELLED: "bg-zinc-500",
};

/** One Step's agent + action + live status — the building block of both the running-task card and the Task Detail workflow header. */
export function WorkflowStepBadge({
  step,
  compact = false,
}: {
  step: WorkflowStep;
  compact?: boolean;
}) {
  const running = step.status === "RUNNING";
  return (
    <div className={cn("flex items-start gap-2", compact ? "text-xs" : "text-sm")}>
      <span aria-hidden className={cn(running && "motion-safe:animate-pulse")}>
        {AGENT_ICON[step.agent]}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-white">{AGENT_LABEL[step.agent]}</span>
          <span className="text-[#8291a3]">{ACTION_LABEL[step.action]}</span>
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", DOT_CLASS[step.status])} />
          {running ? (
            <span className="flex items-center gap-0.5" aria-hidden>
              <span className="typing-dot mono h-1 w-1 rounded-full bg-blue-300" />
              <span className="typing-dot mono h-1 w-1 rounded-full bg-blue-300" />
              <span className="typing-dot mono h-1 w-1 rounded-full bg-blue-300" />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
