"use client";

import { cn, formatDuration } from "@/lib/format";
import { ACTION_LABEL, AGENT_LABEL } from "../workflow-labels";
import type { AgentName, WorkflowStep } from "../types";

/**
 * A Task's Steps as one horizontal track.
 *
 * Not a percentage bar: nothing in this system reports how far through a Step
 * an agent is, so a filling bar would be invented. What *is* known is which
 * Step is live, who owns it, and how long each one actually took — so the
 * track shows stages rather than a fraction, and the live stage is filled with
 * a sweep (motion meaning "working") instead of a number meaning "almost
 * done".
 *
 * Segment width is not proportional to duration either. A 4-second git check
 * next to a 6-minute implement would collapse to a sliver, and the sliver that
 * vanishes is usually the one that failed. The running Step takes the extra
 * space instead, so the track leans toward what is happening now.
 */

const AGENT_FILL: Record<AgentName, string> = {
  claude: "bg-agent-claude",
  codex: "bg-agent-codex",
};

const AGENT_TEXT: Record<AgentName, string> = {
  claude: "text-agent-claude",
  codex: "text-agent-codex",
};

function segmentClass(step: WorkflowStep): string {
  switch (step.status) {
    case "SUCCESS":
      return cn(AGENT_FILL[step.agent], "opacity-70");
    case "RUNNING":
      return cn(AGENT_FILL[step.agent], "opacity-95");
    case "FAILED":
      return "bg-danger";
    case "SKIPPED":
      // Hatched rather than merely dim: a skipped review is a real outcome
      // ("리뷰할 변경 없음"), not an empty slot waiting to be filled.
      return "bg-fg/15 [background-image:repeating-linear-gradient(135deg,transparent_0_3px,rgb(var(--fg)/0.18)_3px_6px)]";
    case "CANCELLED":
      return "bg-fg/20";
    default:
      return "bg-fg/[0.09]";
  }
}

/** One Step's own label under the track. */
function StepLabel({ step, live }: { step: WorkflowStep; live: boolean }) {
  const duration =
    step.startedAt && (step.completedAt || live)
      ? formatDuration(step.startedAt, step.completedAt)
      : null;
  return (
    <span className="flex min-w-0 items-baseline gap-1 text-xs">
      <span className={cn("shrink-0 font-medium", live ? AGENT_TEXT[step.agent] : "text-fg-muted")}>
        {AGENT_LABEL[step.agent]}
      </span>
      <span className="shrink-0 text-fg-faint">{ACTION_LABEL[step.action]}</span>
      {step.status === "SKIPPED" ? (
        <span className="shrink-0 text-fg-faint">생략</span>
      ) : duration ? (
        <span className="mono shrink-0 text-fg-faint">{duration}</span>
      ) : null}
    </span>
  );
}

export function StepTrack({
  steps,
  className,
  showLabels = true,
}: {
  steps: WorkflowStep[];
  className?: string;
  /** Off for dense contexts (a compact row) where the track alone is the signal. */
  showLabels?: boolean;
}) {
  if (steps.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex h-1.5 items-stretch gap-1 overflow-hidden rounded-full">
        {steps.map((step) => {
          const running = step.status === "RUNNING";
          return (
            <span
              key={step.id}
              // The running Step gets the surplus width; the rest share a base
              // so a two-Step Task never renders as one full-width block.
              style={{ flex: running ? "2 1 0%" : "1 1 0%" }}
              className={cn("relative overflow-hidden rounded-full", segmentClass(step))}
              title={`${AGENT_LABEL[step.agent]} ${ACTION_LABEL[step.action]}`}
            >
              {running ? (
                // Motion that means "in progress" without asserting a fraction.
                <span
                  aria-hidden
                  className="scan-sweep absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent"
                />
              ) : null}
            </span>
          );
        })}
      </div>

      {showLabels ? (
        <div className="flex items-baseline gap-3">
          {steps.map((step) => (
            <StepLabel key={step.id} step={step} live={step.status === "RUNNING"} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
