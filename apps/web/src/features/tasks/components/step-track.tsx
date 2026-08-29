"use client";

import { Check, X } from "lucide-react";
import { cn, formatDuration } from "@/lib/format";
import { ACTION_LABEL, AGENT_LABEL } from "../workflow-labels";
import type { AgentName, Task, TaskListItem, WorkflowStep } from "../types";

/**
 * A Task's journey as a milestone rail: a fixed node per stage, joined by
 * segments that fill as the work advances.
 *
 * Two things make this not a progress bar.
 *
 * First, no fraction is ever claimed. Nothing in this system reports how far
 * through a Step an agent is — a Step is RUNNING or it is not — so the live
 * segment carries a sweep (motion meaning "working") rather than a width
 * meaning "almost done".
 *
 * Second, the node count and their positions never change for the life of a
 * Task. `workflow.steps` is built at creation with every Step PENDING, so the
 * shape is known before anything runs: a queued Task already shows "two
 * stages, Claude implements then Codex reviews". Nothing appears or
 * disappears afterwards, so the row never reflows, and the same rail is
 * legible at card size and at row size without the eye relearning it.
 *
 * The 시작 node exists for the single-Step case. Without it a review-only Task
 * would be one segment that is full from the moment it starts — exactly the
 * "100% but still running" reading this component exists to avoid.
 */

type NodeState = "pending" | "done" | "running" | "failed" | "skipped" | "cancelled";

const AGENT_DOT: Record<AgentName, string> = {
  claude: "bg-agent-claude",
  codex: "bg-agent-codex",
};

const AGENT_TEXT: Record<AgentName, string> = {
  claude: "text-agent-claude",
  codex: "text-agent-codex",
};

function nodeStateOf(step: WorkflowStep): NodeState {
  switch (step.status) {
    case "SUCCESS":
      return "done";
    case "RUNNING":
      return "running";
    case "FAILED":
      return "failed";
    case "SKIPPED":
      return "skipped";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

/** A stage the rail draws: the synthetic 시작 node, then one per Step. */
interface Milestone {
  key: string;
  state: NodeState;
  /** null for 시작, which belongs to no Agent. */
  step: WorkflowStep | null;
}

function buildMilestones(task: Pick<Task, "startedAt" | "workflow">): Milestone[] {
  const steps = task.workflow?.steps ?? [];
  return [
    // Filled only once the Task actually began — that is what separates
    // "sitting in the queue" from "running", which a QUEUED Task otherwise
    // has no way to show.
    { key: "__start", state: task.startedAt ? "done" : "pending", step: null },
    ...steps.map((step) => ({ key: step.id, state: nodeStateOf(step), step })),
  ];
}

/** The segment leading *into* a node — filled when the previous stage is behind us. */
function segmentClass(prev: NodeState, next: NodeState): string {
  if (next === "failed") return "bg-danger/70";
  if (next === "running") return "bg-fg/12";
  if (next === "skipped") {
    return "bg-fg/10 [background-image:repeating-linear-gradient(135deg,transparent_0_3px,rgb(var(--fg)/0.16)_3px_6px)]";
  }
  if (next === "done") return "bg-fg/30";
  // Not reached yet.
  return prev === "pending" ? "bg-fg/[0.08]" : "bg-fg/[0.08]";
}

function Node({ milestone, size }: { milestone: Milestone; size: "sm" | "md" }) {
  const { state, step } = milestone;
  const box = size === "md" ? "h-3 w-3" : "h-2 w-2";
  const icon = size === "md" ? "h-2 w-2" : "h-1.5 w-1.5";

  if (state === "failed") {
    return (
      <span
        className={cn(
          "z-10 flex shrink-0 items-center justify-center rounded-full bg-danger text-bg",
          box,
        )}
      >
        <X className={icon} strokeWidth={4} aria-hidden />
      </span>
    );
  }

  if (state === "done" && step) {
    return (
      <span
        className={cn(
          "z-10 flex shrink-0 items-center justify-center rounded-full text-bg",
          AGENT_DOT[step.agent],
          box,
        )}
      >
        <Check className={icon} strokeWidth={4} aria-hidden />
      </span>
    );
  }

  if (state === "running" && step) {
    return (
      <span className={cn("relative z-10 flex shrink-0 items-center justify-center", box)}>
        {/* A halo, not a fill: the node marks where the work *is*, and a solid
            dot would read the same as the completed ones behind it. */}
        <span
          className={cn(
            "absolute inset-0 animate-ping rounded-full opacity-60",
            AGENT_DOT[step.agent],
          )}
          aria-hidden
        />
        <span className={cn("relative rounded-full ring-2 ring-bg", AGENT_DOT[step.agent], box)} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "z-10 shrink-0 rounded-full",
        box,
        state === "skipped"
          ? "bg-fg/25"
          : state === "cancelled"
            ? "bg-fg/20"
            : state === "done"
              ? "bg-fg/40"
              : "bg-fg/15 ring-2 ring-bg",
      )}
    />
  );
}

/** One stage's caption, anchored under its own node rather than packed to the left. */
function NodeLabel({ milestone }: { milestone: Milestone }) {
  const { state, step } = milestone;
  if (!step) {
    return <span className="text-xs text-fg-faint">시작</span>;
  }

  const duration =
    step.startedAt && (step.completedAt || state === "running")
      ? formatDuration(step.startedAt, step.completedAt)
      : null;

  const outcome =
    state === "skipped"
      ? "생략"
      : state === "failed"
        ? "실패"
        : state === "cancelled"
          ? "중단"
          : (duration ?? "대기");

  // One line rather than a stacked name/action/duration block: three stages of
  // three-line captions made the card taller than the work it described.
  return (
    <span className="flex min-w-0 items-baseline gap-1 leading-tight">
      <span
        className={cn(
          "truncate text-xs font-medium",
          state === "running" ? AGENT_TEXT[step.agent] : "text-fg-muted",
        )}
      >
        {AGENT_LABEL[step.agent]}
      </span>
      <span className="shrink-0 text-xs text-fg-faint">{ACTION_LABEL[step.action]}</span>
      <span
        className={cn(
          "mono shrink-0 text-xs",
          state === "failed" ? "text-danger" : "text-fg-faint",
        )}
      >
        {outcome}
      </span>
    </span>
  );
}

export function StepTrack({
  task,
  showLabels = true,
  size = "md",
  className,
}: {
  task: Pick<Task, "startedAt" | "workflow"> | TaskListItem;
  /** Off for the compact list rows, where the rail alone carries the signal. */
  showLabels?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const milestones = buildMilestones(task);
  if (milestones.length < 2) return null;

  return (
    <div className={cn("min-w-0", className)}>
      {/*
        A groove is drawn first, across the full width, and the stage segments
        sit inside it. Without it the unreached part of the route was nearly
        invisible, so the nodes read as marks floating in space rather than as
        positions along one path — and a Task with a long final stage looked
        broken rather than unfinished.
      */}
      <div className="relative flex h-3 items-center">
        <span aria-hidden className="absolute inset-x-0 h-[3px] rounded-full bg-fg/[0.09]" />

        <div className="relative flex w-full items-center">
          {milestones.map((m, i) => (
            <div
              key={m.key}
              // Every gap is one equal share. Sizing them by state made the
              // running stage swell and the nodes slide sideways as work
              // advanced, which defeats the whole point of a milestone: the
              // position is supposed to be the thing that does not move.
              className={cn("flex items-center", i === 0 ? "shrink-0" : "min-w-0 flex-1")}
            >
              {i > 0 ? (
                <span
                  className={cn(
                    "h-[3px] min-w-0 flex-1 overflow-hidden rounded-full",
                    segmentClass(milestones[i - 1]!.state, m.state),
                  )}
                >
                  {m.state === "running" ? (
                    <span
                      aria-hidden
                      className="scan-sweep block h-full w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                    />
                  ) : null}
                </span>
              ) : null}
              <Node milestone={m} size={size} />
            </div>
          ))}
        </div>
      </div>

      {showLabels ? (
        <div className="mt-1 flex items-start">
          {milestones.map((m, i) => (
            <div
              key={m.key}
              className={cn(
                "flex min-w-0",
                i === 0 ? "shrink-0 justify-start" : "flex-1 justify-end",
              )}
            >
              <NodeLabel milestone={m} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
