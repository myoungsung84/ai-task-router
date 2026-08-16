import { cn } from "@/lib/format";
import { AgentAvatar } from "@/components/agent-icon";
import { Badge, type Tone } from "@/components/badge";
import { ACTION_LABEL, AGENT_LABEL, STEP_STATUS_LABEL } from "../workflow-labels";
import type { Workflow, WorkflowStep } from "../types";

const STEP_TONE: Record<WorkflowStep["status"], Tone> = {
  PENDING: "neutral",
  RUNNING: "info",
  SUCCESS: "success",
  SKIPPED: "neutral",
  FAILED: "danger",
  CANCELLED: "neutral",
};

/**
 * A vertical timeline — connecting line + AI avatar beads — rather than a
 * stack of bordered step boxes: it reads as a sequence, and it stays narrow
 * enough to live in the detail screen's metadata column. Each step is one
 * line ("Claude 구현" + state), with the review outcome or error added only
 * when there is one.
 */
export function WorkflowTimeline({ workflow }: { workflow: Workflow }) {
  return (
    <ol>
      {workflow.steps.map((step, i) => {
        const isLast = i === workflow.steps.length - 1;
        return (
          <li key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <AgentAvatar
                agent={step.agent}
                size="sm"
                className={cn(step.status === "RUNNING" && "motion-safe:animate-pulse")}
              />
              {!isLast ? <div className="my-1 w-px flex-1 bg-border" /> : null}
            </div>
            <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-4")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm text-fg">
                  <span className="font-medium">{AGENT_LABEL[step.agent]}</span>{" "}
                  {ACTION_LABEL[step.action]}
                </span>
                <Badge tone={STEP_TONE[step.status]}>{STEP_STATUS_LABEL[step.status]}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-fg-muted">
                {step.permission === "write" ? "쓰기 가능" : "읽기 전용"}
                {step.skipReason === "NO_CHANGES" ? " · 변경 없음" : ""}
              </p>
              {step.result?.review ? (
                <p className="mt-1 text-xs text-fg-muted">
                  검토 결과{" "}
                  <span
                    className={
                      step.result.review.result === "WARNING" ? "text-warning" : "text-success"
                    }
                  >
                    {step.result.review.result}
                  </span>
                  {step.result.review.issues.length
                    ? ` · 지적 ${step.result.review.issues.length}건`
                    : ""}
                </p>
              ) : null}
              {step.error ? (
                <p className="mt-1 break-words text-xs text-danger">{step.error}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
