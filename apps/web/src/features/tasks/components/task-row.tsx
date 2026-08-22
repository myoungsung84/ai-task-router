"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Play, Square, Trash2 } from "lucide-react";
import { cn, formatDuration, projectName } from "@/lib/format";
import { IconButton } from "@/components/button";
import { AgentAvatar } from "@/components/agent-icon";
import { Badge, type Tone } from "@/components/badge";
import { TaskStatusBadge } from "./task-status-badge";
import {
  AGENT_LABEL,
  ATTENTION_REASON_LABEL,
  attentionReasonOf,
  taskActivityPhrase,
  type AttentionReason,
} from "../workflow-labels";
import { useTask } from "../hooks/use-task";
import { useNowTick } from "../hooks/use-now-tick";
import type { TaskListItem } from "../types";

const RESULT_TEXT_LIMIT = 120;

/**
 * The list is one column of rows sharing a fixed set of column widths —
 * status, work, AI, project, elapsed, actions — declared here once and
 * reused by the header row (`TaskListHeader`) and every data row, so the
 * columns actually line up instead of each row negotiating its own layout.
 * Columns drop out from the right as the viewport narrows; the "work"
 * column (title + outcome) is the only one that never disappears, and it
 * absorbs the status badge on small screens.
 */
const COL = {
  status: "hidden w-[6.5rem] shrink-0 sm:block",
  agents: "hidden w-[7.5rem] shrink-0 lg:block",
  project: "hidden w-[9rem] shrink-0 md:block",
  time: "w-14 shrink-0 text-right",
  // Wide enough for the busiest case (a queued row's 실행 + 중단, two 32px
  // buttons), and fixed at that width for every row — the delete button only
  // fades in on hover, so if this column sized to its contents the whole row
  // would re-lay-out under the cursor.
  actions: "w-[4.5rem] shrink-0",
};

const ROW_BASE =
  "group relative flex cursor-pointer items-center gap-4 px-4 transition-colors duration-fast hover:bg-fg/[0.03]";

/** Reason chip tone — REVIEW_NEEDS_FIX reads softer (지적 사항, still fixable from the review itself) than the two "이 결과를 신뢰할 수 없다" cases. */
const ATTENTION_REASON_TONE: Record<AttentionReason, Tone> = {
  EXECUTION_FAILED: "danger",
  REVIEW_FAILED: "danger",
  REVIEW_NEEDS_FIX: "warning",
};

function truncateResult(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= RESULT_TEXT_LIMIT) return flat;
  return flat.slice(0, RESULT_TEXT_LIMIT).trimEnd() + "…";
}

/**
 * The single most useful sentence about this Task's outcome: for a Task
 * that needs attention, the first concrete review issue or failure reason;
 * otherwise the neutral state phrase. Never the raw multi-line message —
 * one row must never grow tall enough to dominate the list.
 */
function resultLine(task: TaskListItem): { text: string; tone: "warning" | "muted" } {
  if (task.status === "WARNING") {
    for (const step of task.workflow.steps) {
      const issue = step.result?.review?.issues[0];
      if (issue) {
        return {
          text: truncateResult(`${AGENT_LABEL[step.agent]}: ${issue.message}`),
          tone: "warning",
        };
      }
    }
  }
  if (task.status === "FAILED") {
    const failed = task.workflow.steps.find((s) => s.status === "FAILED");
    const text = failed?.error ? `${AGENT_LABEL[failed.agent]}: ${failed.error}` : task.error;
    if (text) return { text: truncateResult(text), tone: "warning" };
  }
  return { text: taskActivityPhrase(task), tone: "muted" };
}

/** Column headings for the list — same widths as the rows below, so the list reads as a table rather than a stack of unrelated blocks even when it holds a single item. */
export function TaskListHeader() {
  return (
    <div className="flex items-center gap-4 border-b border-border bg-fg/[0.02] px-4 py-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
      <div className={COL.status}>상태</div>
      <div className="min-w-0 flex-1">작업</div>
      <div className={COL.agents}>담당</div>
      <div className={COL.project}>프로젝트</div>
      <div className={COL.time}>시간</div>
      <div className={COL.actions} aria-hidden />
    </div>
  );
}

function AgentStack({ agents }: { agents: TaskListItem["workflow"]["steps"][number]["agent"][] }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex -space-x-1.5">
        {agents.map((a) => (
          <AgentAvatar key={a} agent={a} size="sm" className="ring-2 ring-surface" />
        ))}
      </span>
      <span className="truncate text-xs text-fg-muted">
        {agents.map((a) => AGENT_LABEL[a]).join(" · ")}
      </span>
    </span>
  );
}

function RowShell({
  task,
  accent = false,
  extra,
  actions,
  className,
}: {
  task: TaskListItem;
  accent?: boolean;
  extra?: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  const result = resultLine(task);
  const attentionReason = attentionReasonOf(task);
  const agents = Array.from(new Set(task.workflow.steps.map((s) => s.agent)));
  return (
    <div className={cn(ROW_BASE, extra ? "py-3" : "py-2.5", className)}>
      {accent ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand" /> : null}
      <div className={COL.status}>
        <TaskStatusBadge status={task.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {/*
            One real link, stretched over the row by its own `::after`
            overlay — that is what makes status / title / AI / project / time
            all clickable without nesting them inside an anchor (which would
            make every cell a link target for assistive tech) and without a
            row-level onClick (which would swallow the buttons' clicks). The
            action column sits above this overlay, see COL.actions usage.
          */}
          <Link
            href={`/tasks/${task.jobId}`}
            className="min-w-0 truncate text-sm font-medium text-fg after:absolute after:inset-0 after:content-[''] group-hover:underline"
          >
            {task.title}
          </Link>
          <span className="sm:hidden">
            <TaskStatusBadge status={task.status} />
          </span>
        </div>
        <p className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-xs">
          <span className="mono shrink-0 text-fg-faint">{task.jobId}</span>
          {attentionReason ? (
            <Badge tone={ATTENTION_REASON_TONE[attentionReason]} className="shrink-0">
              {ATTENTION_REASON_LABEL[attentionReason]}
            </Badge>
          ) : null}
          <span
            className={cn(
              "min-w-0 truncate",
              result.tone === "warning" ? "text-warning" : "text-fg-muted",
            )}
          >
            {result.text}
          </span>
        </p>
        {extra}
      </div>
      <div className={COL.agents}>
        <AgentStack agents={agents} />
      </div>
      <div className={cn(COL.project, "mono truncate text-xs text-fg-muted")}>
        <span title={task.projectPath}>{projectName(task.projectPath)}</span>
      </div>
      <div className={cn(COL.time, "mono text-xs text-fg-faint")}>
        {formatDuration(task.startedAt, task.completedAt)}
      </div>
      {/*
        `relative z-10` lifts the whole action column above the stretched
        link's overlay, so this strip — not just the buttons, but the padding
        around them — is a dead zone for navigation and a live one for the
        buttons. `stopPropagation` is belt-and-braces: nothing on the row
        listens for clicks today, and this keeps it that way if a row-level
        handler is ever added.
      */}
      <div
        className={cn(COL.actions, "relative z-10 flex justify-end")}
        onClick={(e) => e.stopPropagation()}
      >
        {actions}
      </div>
    </div>
  );
}

/**
 * A finished Task's row. Every Task rendered here is in a terminal status,
 * so deleting is always safe (no cancel-first step).
 */
export function TaskRow({
  task,
  onDeleteClick,
}: {
  task: TaskListItem;
  onDeleteClick: (task: TaskListItem) => void;
}) {
  return (
    <RowShell
      task={task}
      actions={
        <IconButton
          label={`${task.jobId} 삭제`}
          size="sm"
          onClick={() => onDeleteClick(task)}
          className="text-fg-faint opacity-0 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </IconButton>
      }
    />
  );
}

/**
 * A queued/running/reviewing Task's row — the same row, plus a brand flag
 * on the left edge and one line of live log tail, so "work is happening"
 * is visible without breaking the list into a second layout. Opens its own
 * small SSE subscription (via `useTask`) purely for that log tail and
 * fine-grained step updates; the dashboard's list poll already keeps
 * membership and overall status current, so this adds one stream per
 * *currently active* Task, not per row.
 */
export function ActiveTaskRow({
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
  const { task: live } = useTask(listTask.id);
  const task = live ?? listTask;
  const isQueued = task.status === "QUEUED";
  const cancellable = task.status === "RUNNING" || task.status === "REVIEWING" || isQueued;
  const recentLog = live
    ? [...live.logs].reverse().find((l) => l.source !== "system" && l.text.trim())
    : undefined;

  // Forces a re-render every second while genuinely active, so the elapsed
  // readout keeps moving — a real timestamp diff (formatDuration falls back
  // to Date.now()), not a simulated progress bar.
  useNowTick(task.status === "RUNNING" || task.status === "REVIEWING");

  return (
    <RowShell
      task={task}
      accent
      extra={
        recentLog ? (
          <p className="mono mt-1.5 truncate text-xs text-fg-faint">
            <span aria-hidden>&gt; </span>
            {recentLog.text}
          </p>
        ) : null
      }
      actions={
        <div className="flex items-center">
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
              <Square className="h-4 w-4" aria-hidden />
            </IconButton>
          ) : null}
        </div>
      }
    />
  );
}
