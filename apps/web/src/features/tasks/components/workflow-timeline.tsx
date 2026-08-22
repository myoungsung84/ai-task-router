"use client";

import Link from "next/link";
import { cn, formatDuration } from "@/lib/format";
import { AgentAvatar } from "@/components/agent-icon";
import { Badge, type Tone } from "@/components/badge";
import { useNowTick } from "../hooks/use-now-tick";
import { ACTION_LABEL, AGENT_LABEL, LINK_KIND_LABEL, STEP_STATUS_LABEL } from "../workflow-labels";
import type { TaskLinkKind, Workflow, WorkflowStep } from "../types";

const STEP_TONE: Record<WorkflowStep["status"], Tone> = {
  PENDING: "neutral",
  RUNNING: "info",
  SUCCESS: "success",
  SKIPPED: "neutral",
  FAILED: "danger",
  CANCELLED: "neutral",
};

/** One related Task, resolved down to just what this view needs (jobId to link to it, linkKind to label the relationship). Computed by the caller (task-detail.tsx already walks parentTaskId/children for its breadcrumb) — this component never fetches or infers relations itself. */
export interface RelatedTaskRef {
  jobId: string;
  linkKind: TaskLinkKind | null;
}

export interface WorkflowTimelineRelations {
  parent?: RelatedTaskRef | null;
  children?: RelatedTaskRef[];
}

/** `시작 HH:MM:SS · 소요 12m 3s` / `시작 HH:MM:SS` (아직 진행 중) / 아무 것도 없으면 null. */
function stepTimingText(step: WorkflowStep): string | null {
  if (!step.startedAt) return null;
  const started = `시작 ${new Date(step.startedAt).toLocaleTimeString()}`;
  const duration = `소요 ${formatDuration(step.startedAt, step.completedAt)}`;
  const ended = step.completedAt
    ? ` · 종료 ${new Date(step.completedAt).toLocaleTimeString()}`
    : "";
  return `${started}${ended} · ${duration}`;
}

/**
 * A vertical timeline — connecting line + AI avatar beads — rather than a
 * stack of bordered step boxes: it reads as a sequence, and it stays narrow
 * enough to live in the detail screen's metadata column. Each step is one
 * block ("Claude 구현" + state + timing), with the review outcome or error
 * added only when there is one, and the currently-running step picked out
 * with a highlighted background so "what's happening right now" never
 * requires reading every row's status badge.
 *
 * `relations` is optional and purely presentational — when the caller has
 * already resolved this Task's parent/children (see `RelatedTaskRef`), it's
 * rendered as one more block below the Steps. This is the Task's own
 * `workflow.steps[]` (unchanged meaning) plus, separately, the Task-level
 * relationships — the two are kept visually distinct so "Workflow" here
 * never gets confused with a "Task를 묶는 상위 Workflow" concept that
 * doesn't exist in this codebase.
 */
export function WorkflowTimeline({
  workflow,
  relations,
}: {
  workflow: Workflow;
  relations?: WorkflowTimelineRelations;
}) {
  const hasRunningStep = workflow.steps.some((s) => s.status === "RUNNING");
  // Keeps a RUNNING step's "소요 Xm Ys" readout moving even when no new log
  // line has arrived yet to force a re-render on its own.
  useNowTick(hasRunningStep);

  const children = relations?.children ?? [];
  const showRelations = !!relations?.parent || children.length > 0;

  return (
    <div className="space-y-5">
      <ol>
        {workflow.steps.map((step, i) => {
          const isLast = i === workflow.steps.length - 1;
          const isRunning = step.status === "RUNNING";
          const timing = stepTimingText(step);
          return (
            <li key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <AgentAvatar
                  agent={step.agent}
                  size="sm"
                  className={cn(isRunning && "motion-safe:animate-pulse")}
                />
                {!isLast ? <div className="my-1 w-px flex-1 bg-border" /> : null}
              </div>
              <div
                className={cn(
                  "min-w-0 flex-1 rounded-md px-2 py-1.5 -mx-2",
                  isLast ? "mb-0" : "mb-2",
                  // The one step actually running right now gets a subtle
                  // highlight — the sole visual cue for "이게 현재 진행
                  // 단계다" beyond the badge, so a long Workflow's current
                  // position never has to be found by reading every status.
                  isRunning && "bg-info/[0.06] ring-1 ring-info/20",
                )}
              >
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
                {timing ? <p className="mono mt-1 text-xs text-fg-faint">{timing}</p> : null}
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

      {showRelations ? (
        <div className="space-y-1.5 border-t border-border pt-3 text-xs">
          {relations?.parent ? (
            <p className="text-fg-muted">
              부모 Task{" "}
              <Link
                href={`/tasks/${relations.parent.jobId}`}
                className="mono text-fg-secondary hover:text-fg hover:underline"
              >
                {relations.parent.jobId}
              </Link>
              {relations.parent.linkKind ? ` (${LINK_KIND_LABEL[relations.parent.linkKind]})` : ""}
            </p>
          ) : null}
          {children.length > 0 ? (
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-fg-muted">
              후속 Task{" "}
              {children.map((c, i) => (
                <span key={c.jobId}>
                  <Link
                    href={`/tasks/${c.jobId}`}
                    className="mono text-fg-secondary hover:text-fg hover:underline"
                  >
                    {c.jobId}
                  </Link>
                  {c.linkKind ? ` (${LINK_KIND_LABEL[c.linkKind]})` : ""}
                  {i < children.length - 1 ? "," : ""}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
