"use client";

import Link from "next/link";
import { CircleStop, Play } from "lucide-react";
import { IconButton } from "@/components/button";
import { AgentMark } from "@/features/agents/components/agent-character";
import { deriveAgentPresence } from "@/features/agents/agent-activity";
import { formatDuration, projectName } from "@/lib/format";
import { useTask } from "../hooks/use-task";
import { useNowTick } from "../hooks/use-now-tick";
import { ActivityTrace } from "./activity-trace";
import { JobIdTag } from "./job-id-tag";
import { StepTrack } from "./step-track";
import { pickLogLine } from "../lib/pick-log-line";
import type { TaskListItem, WorkflowStep } from "../types";

/**
 * A running Task, given the room a running Task deserves.
 *
 * The list used to draw every Task the same way, which meant the one thing
 * actually happening looked identical to forty finished ones — the reason the
 * dashboard read as an archive rather than a workspace. Density is now split
 * by state: 진행 중 Tasks get this card, and 확인 필요/완료 keep the compact
 * rows, where scanning many at once is the point.
 *
 * The character on the left is whoever owns the *current* Step, so on an
 * implement Task it changes from the implementer to the reviewer partway
 * through — the handoff happens on the card you are already watching, rather
 * than by moving the card somewhere else.
 */

/** The Step that owns the Task right now: the running one, else the first not yet done. */
function currentStep(steps: WorkflowStep[]): WorkflowStep | null {
  return (
    steps.find((s) => s.status === "RUNNING") ??
    steps.find((s) => s.status === "PENDING") ??
    steps[steps.length - 1] ??
    null
  );
}

export function ActiveTaskCard({
  task: listTask,
  onCancelClick,
  onStartClick,
  starting = false,
}: {
  task: TaskListItem;
  onCancelClick: (task: TaskListItem) => void;
  onStartClick?: (task: TaskListItem) => void;
  starting?: boolean;
}) {
  // Same live subscription the row had — the card only changes how it is
  // drawn, not where its data comes from.
  const { task: live } = useTask(listTask.id);
  const task = live ?? listTask;

  const isQueued = task.status === "QUEUED";
  const cancellable = task.status === "RUNNING" || task.status === "REVIEWING" || isQueued;
  useNowTick(task.status === "RUNNING" || task.status === "REVIEWING");

  const steps = task.workflow?.steps ?? [];
  const step = currentStep(steps);
  // Presence for this Task alone, cast to the Agent holding it — the same
  // derivation the AI team strip uses, so a character never says one thing at
  // the top of the page and another down here.
  const activity = step
    ? (deriveAgentPresence([task], [step.agent])[0]?.activity ?? "idle")
    : "idle";

  // Prefers the agent's own words over its shell plumbing — see pickLogLine.
  const recentLog = live ? pickLogLine(live.logs) : null;

  return (
    <div className="group relative flex items-start gap-4 px-4 py-4 transition-colors duration-fast hover:bg-fg/[0.03]">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand" />

      <AgentMark agent={step?.agent ?? "claude"} activity={activity} size={48} className="mt-0.5" />

      <div className="min-w-0 flex-1 space-y-2">
        {/* Job ID leads the card — it is the handle used to refer to this Task
            everywhere else (chat, MCP, the URL), so it is findable before the
            title rather than buried in the metadata line under it. */}
        <div className="flex min-w-0 items-center gap-2">
          <JobIdTag jobId={task.jobId} size="md" />
          <Link
            href={`/tasks/${task.jobId}`}
            className="min-w-0 truncate text-base font-semibold text-fg after:absolute after:inset-0 after:content-[''] group-hover:underline"
          >
            {task.title}
          </Link>
          {/* Total elapsed, but only when it isn't the same number the rail is
              already showing: a single-Step Task's total *is* its Step's
              duration, and printing it twice reads as two different facts. */}
          {steps.length > 1 && task.startedAt ? (
            <span className="mono ml-auto shrink-0 text-xs text-fg-muted">
              {formatDuration(task.startedAt, task.completedAt)}
            </span>
          ) : null}
        </div>

        {/* The rail and the log trace sit together: both answer "is this
            moving", so splitting them left the trace floating beside the
            project name with nothing to relate it to. */}
        <div className="flex min-w-0 items-end gap-3">
          <StepTrack task={task} className="min-w-0 flex-1" />
          {live && !isQueued ? <ActivityTrace logs={live.logs} className="shrink-0 pb-1" /> : null}
        </div>

        <div className="flex min-w-0 items-baseline gap-2 text-xs">
          <span className="min-w-0 truncate text-fg-muted">{projectName(task.projectPath)}</span>
          {recentLog ? (
            <span className="mono min-w-0 flex-1 truncate text-fg-faint">
              <span aria-hidden>&gt; </span>
              {recentLog}
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center">
        {isQueued && onStartClick ? (
          <IconButton
            label="지금 실행"
            size="sm"
            onClick={() => onStartClick(listTask)}
            disabled={starting}
          >
            <Play className="h-4 w-4" aria-hidden />
          </IconButton>
        ) : null}
        {cancellable ? (
          <IconButton
            label={isQueued ? "대기 취소" : "실행 중단"}
            size="sm"
            onClick={() => onCancelClick(listTask)}
          >
            <CircleStop className="h-4 w-4" aria-hidden />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}
