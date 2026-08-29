"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { cn, formatDuration, projectName } from "@/lib/format";
import { IconButton } from "@/components/button";
import { AgentAvatar } from "@/components/agent-icon";
import { Badge, type Tone } from "@/components/badge";
import { TaskStatusBadge } from "./task-status-badge";
import { JobIdTag } from "./job-id-tag";
import {
  AGENT_LABEL,
  ATTENTION_REASON_LABEL,
  attentionReasonOf,
  taskActivityPhrase,
  type AttentionReason,
} from "../workflow-labels";
import { compareReviewIssueSeverity } from "../types";
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

/**
 * A 3px status flag down the row's left edge, the same device the running card
 * uses for its brand-coloured bar — so "what state is this in" is answerable by
 * colour down a column, before any badge is read.
 *
 * This replaced a full milestone rail under every finished row. The rail was
 * real information (which Agents ran, where it stopped), but twenty grey rails
 * stacked down the list cost more rhythm than they returned: for a Task that is
 * over, the one thing worth scanning is its outcome, and the detail page is one
 * click away for the rest.
 */
const STATUS_RAIL: Record<TaskListItem["status"], string> = {
  QUEUED: "bg-neutral/50",
  RUNNING: "bg-brand",
  REVIEWING: "bg-reviewing",
  READY: "bg-success",
  WARNING: "bg-warning",
  FAILED: "bg-danger",
  CANCELLED: "bg-neutral/40",
};

/** Reason chip tone — REVIEW_NEEDS_FIX reads softer (지적 사항, still fixable from the review itself) than the other, more urgent cases. */
const ATTENTION_REASON_TONE: Record<AttentionReason, Tone> = {
  EXECUTION_FAILED: "danger",
  SECURITY_CRITICAL: "danger",
  SECURITY_HIGH: "danger",
  REVIEW_LOOP_EXCEEDED: "danger",
  REQUIREMENT_CLARIFICATION: "warning",
  REVIEW_FAILED: "danger",
  REVIEW_NEEDS_FIX: "warning",
};

function truncateResult(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= RESULT_TEXT_LIMIT) return flat;
  return flat.slice(0, RESULT_TEXT_LIMIT).trimEnd() + "…";
}

/**
 * The single most useful sentence about this Task's outcome — or `null` when
 * there is no such sentence and the status badge already carries everything
 * this row knows. Never the raw multi-line message: one row must never grow
 * tall enough to dominate the list.
 *
 * `null` rather than a phrase restating the status, because that fallback
 * asserted things that were not true. `READY` read "지적 사항 없음" even for an
 * `analyze` Task, whose workflow has no review Step at all (buildWorkflowForPurpose
 * gives it a single `analyze` Step), and for an `implement` Task whose review was
 * SKIPPED on NO_CHANGES — a verdict nobody ever handed down, printed where the real
 * outcome should be. `WARNING` + REVIEW_FAILED was worse: the review process itself
 * died, so `issues` is empty, and the row contradicted its own badge — `리뷰 실행 실패`
 * beside "검토 지적 사항 있음". `CANCELLED` and a `FAILED` carrying no error text
 * merely said the badge over again.
 *
 * A Task still in flight keeps its phrase, because there it is real information the
 * badge cannot carry: `실행 중` does not say which agent is doing what.
 */
function resultLine(task: TaskListItem): { text: string; tone: "warning" | "muted" } | null {
  if (task.status === "WARNING") {
    // Same priority as the reason chip next to this text: a Security issue
    // (then highest severity) is the most useful single line to show, not
    // just whichever issue the reviewing agent happened to list first.
    const ranked = task.workflow.steps
      .flatMap((step) => (step.result?.review?.issues ?? []).map((issue) => ({ step, issue })))
      .sort((a, b) => {
        const aSecurity = a.issue.category === "SECURITY" ? 1 : 0;
        const bSecurity = b.issue.category === "SECURITY" ? 1 : 0;
        if (aSecurity !== bSecurity) return bSecurity - aSecurity;
        return compareReviewIssueSeverity(b.issue.severity, a.issue.severity);
      });
    const top = ranked[0];
    if (top) {
      return {
        text: truncateResult(`${AGENT_LABEL[top.step.agent]}: ${top.issue.message}`),
        tone: "warning",
      };
    }
  }
  if (task.status === "FAILED") {
    const failed = task.workflow.steps.find((s) => s.status === "FAILED");
    const text = failed?.error ? `${AGENT_LABEL[failed.agent]}: ${failed.error}` : task.error;
    if (text) return { text: truncateResult(text), tone: "warning" };
  }
  // Reached by an attention Task with no concrete detail to show (a review that
  // produced no issues, a failure that recorded no error) and by the whole 완료
  // group. Attention rows keep their second line either way — the reason badge
  // sits on it — so 완료 rows are the only ones that lose one, and all of them
  // do. Collapsing by status *inside* a group would alternate row heights down
  // the list instead.
  if (task.status === "QUEUED" || task.status === "RUNNING" || task.status === "REVIEWING") {
    return { text: taskActivityPhrase(task), tone: "muted" };
  }
  return null;
}

/** Column headings for the list — same widths as the rows below, so the list reads as a table rather than a stack of unrelated blocks even when it holds a single item. */
export function TaskListHeader() {
  return (
    <div className="flex items-center gap-4 border-b border-border bg-fg/[0.02] px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
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
  actions,
  className,
}: {
  task: TaskListItem;
  actions: ReactNode;
  className?: string;
}) {
  const result = resultLine(task);
  const attentionReason = attentionReasonOf(task);
  const agents = Array.from(new Set(task.workflow.steps.map((s) => s.agent)));
  // py-4, on the documented 4px scale (see globals.css "Spacing"). Rows that
  // carry two lines — title, then outcome — kept the padding chosen when they
  // carried one, so the text ran nearly edge to edge and the list read as
  // cramped. The rows had not grown; their contents had. 완료 rows carry the
  // title alone and settle back to one line on the same padding.
  return (
    <div className={cn(ROW_BASE, "py-4", className)}>
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-[3px]", STATUS_RAIL[task.status])}
      />
      <div className={COL.status}>
        <TaskStatusBadge status={task.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {/* The Job ID leads the row rather than sitting in the metadata line
              below, where it shared weight and colour with the outcome text and
              could not be scanned down a column. */}
          <JobIdTag jobId={task.jobId} />
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
        {attentionReason || result ? (
          <p className="mt-1 flex min-w-0 items-baseline gap-1.5 text-xs">
            {attentionReason ? (
              <Badge tone={ATTENTION_REASON_TONE[attentionReason]} className="shrink-0">
                {ATTENTION_REASON_LABEL[attentionReason]}
              </Badge>
            ) : null}
            {result ? (
              <span
                className={cn(
                  "min-w-0 truncate",
                  result.tone === "warning" ? "text-warning" : "text-fg-muted",
                )}
              >
                {result.text}
              </span>
            ) : null}
          </p>
        ) : null}
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
