"use client";

import Link from "next/link";
import { CircleStop, Play } from "lucide-react";
import { IconButton } from "@/components/button";
import { AgentMark } from "@/features/agents/components/agent-character";
import { deriveAgentPresence } from "@/features/agents/agent-activity";
import { cn, formatDuration, projectName } from "@/lib/format";
import { useTask } from "../hooks/use-task";
import { useNowTick } from "../hooks/use-now-tick";
import { ActivityEqualizer, StallBadge } from "./activity-trace";
import { JobIdTag } from "./job-id-tag";
import { StepTrack } from "./step-track";
import { pickLogLineOrSystem } from "../lib/pick-log-line";
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
  /**
   * The Task has finished and the list is holding it here just long enough to
   * play its exit (see `useTaskTransitions`). Everything live about the card —
   * equalizer, rail light, the character's motion — is already off by this
   * point, because the status it reads is terminal; this only fades what is
   * left and closes the gap it occupied.
   */
}) {
  // Same live subscription the row had — the card only changes how it is
  // drawn, not where its data comes from.
  const { task: live } = useTask(listTask.id);
  const task = live ?? listTask;

  const isQueued = task.status === "QUEUED";
  // Executing, as opposed to sitting in the queue. Drives both the 1s tick and
  // the background wash, so a card can never be washed without also ticking.
  const isLive = task.status === "RUNNING" || task.status === "REVIEWING";
  const cancellable = isLive || isQueued;
  useNowTick(isLive);

  const steps = task.workflow?.steps ?? [];
  const step = currentStep(steps);
  // Presence for this Task alone, cast to the Agent holding it — the same
  // derivation the AI team strip uses, so a character never says one thing at
  // the top of the page and another down here.
  const activity = step
    ? (deriveAgentPresence([task], [step.agent])[0]?.activity ?? "idle")
    : "idle";

  // Prefers the agent's own words over its shell plumbing, and falls back to
  // the router's own line while a buffering agent has said nothing at all —
  // which, for Claude, is almost the whole run. See pickLogLineOrSystem.
  const recentLog = live ? pickLogLineOrSystem(live.logs) : null;

  return (
    <div
      // The list finds this card by id in the commit that inserts the matching
      // 완료 row, so it can shrink this one by exactly that row's height.
      className={cn(
        "group relative flex items-start gap-4 px-4 py-4 transition-colors duration-fast hover:bg-fg/[0.03]",
      )}
    >
      {/* The rail, with current running through it while the Task executes. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] overflow-hidden bg-brand">
        {isLive ? (
          <span className="rail-run absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-white/80 to-transparent" />
        ) : null}
      </span>

      {/*
        The card's own equalizer, filling it rather than sitting in a corner of
        it. A gradient wash lived here first and carried no information at all;
        this draws the Task's actual log arrival, and only invents a rhythm in
        the one state where there is provably nothing to draw (see
        `ActivityEqualizer`). Below the content (`z-0` here, `z-10` on
        everything that carries text) and clipped by the card, so it can never
        take a label down with it or bleed into the rows stacked either side.
      */}
      {live && !isQueued ? (
        <span className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {/* Mounted for as long as the card is, not only while it runs: the
              equalizer fades itself out when `running` goes false, and
              unmounting it here would take that fade away and end the run by
              switching the colour off. */}
          <ActivityEqualizer logs={live.logs} agent={step?.agent ?? "claude"} running={isLive} />
        </span>
      ) : null}

      <AgentMark
        agent={step?.agent ?? "claude"}
        activity={activity}
        size={48}
        className="z-10 mt-0.5"
      />

      <div className="relative z-10 min-w-0 flex-1 space-y-2">
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

        <StepTrack task={task} />

        {/*
          One line for "where and what": the project it runs in, the phrase for
          whatever it is doing this second, and — last, where a colour still
          catches the eye — the stall warning. These were previously split
          across the rail row and the project row, which left the trace
          floating beside a project name with nothing to relate it to.
        */}
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="shrink-0 truncate text-fg-muted">{projectName(task.projectPath)}</span>
          {recentLog ? (
            <>
              <span className="shrink-0 text-fg-faint" aria-hidden>
                ·
              </span>
              {/* Smaller than the project name beside it, and truncated: this
                  is the noisiest thing on the card and the one most likely to
                  arrive as a 200-character command line. */}
              <span className="min-w-0 flex-1 truncate text-[11px] leading-tight text-fg-secondary">
                {recentLog}
              </span>
            </>
          ) : (
            <span className="flex-1" />
          )}
          {live && !isQueued ? <StallBadge logs={live.logs} /> : null}
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
          // Reddens on hover: stopping a run is destructive and irreversible,
          // and a stop control that stays the same quiet grey as every other
          // icon button gives no warning before the click.
          <IconButton
            label={isQueued ? "대기 취소" : "실행 중단"}
            size="sm"
            onClick={() => onCancelClick(listTask)}
            className="hover:bg-danger/10 hover:text-danger"
          >
            <CircleStop className="h-4 w-4" aria-hidden />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}
