import Link from "next/link";
import { formatDuration, projectName } from "@/lib/format";
import { TaskStatusBadge } from "./task-status-badge";
import { AGENT_LABEL } from "../workflow-labels";
import type { TaskListItem } from "../types";

/** First concrete reason a WARNING/FAILED Task needs a look — not just the badge. */
function headline(task: TaskListItem): string | null {
  if (task.status === "WARNING") {
    for (const step of task.workflow.steps) {
      const issue = step.result?.review?.issues[0];
      if (issue) return `${AGENT_LABEL[step.agent]}: ${issue.message}`;
    }
    return null;
  }
  if (task.status === "FAILED") {
    const failed = task.workflow.steps.find((s) => s.status === "FAILED");
    if (failed?.error) return `${AGENT_LABEL[failed.agent]}: ${failed.error}`;
    return task.error;
  }
  return null;
}

/**
 * Compact row for the 확인 필요 / 완료 / 전체 groups — less visually loud than
 * the running-task cards, but WARNING/FAILED still surface their headline
 * issue inline. Every Task shown here is in a terminal status, so it's
 * always safe to delete directly (no cancel-first step needed).
 */
export function TaskRow({
  task,
  onDeleteClick,
}: {
  task: TaskListItem;
  onDeleteClick: (task: TaskListItem) => void;
}) {
  const issue = headline(task);
  return (
    <div className="group flex items-center gap-2 rounded-md border border-[#232c38] bg-[#121821] px-4 py-2.5 hover:border-[#33404f]">
      <Link href={`/tasks/${task.jobId}`} className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="mono text-xs text-[#8291a3]">{task.jobId}</span>
              <span className="truncate text-sm text-white">{task.title}</span>
            </div>
            <div className="mono mt-0.5 truncate text-xs text-[#8291a3]">
              {projectName(task.projectPath)}
              {task.branch ? ` · ${task.branch}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="mono text-xs text-[#8291a3]">
              {formatDuration(task.startedAt, task.completedAt)}
            </span>
            <TaskStatusBadge status={task.status} />
          </div>
        </div>
        {issue ? <p className="mt-1.5 line-clamp-1 text-xs text-amber-300/90">{issue}</p> : null}
      </Link>
      <button
        type="button"
        aria-label={`${task.jobId} 삭제`}
        title="삭제"
        onClick={(e) => {
          e.preventDefault();
          onDeleteClick(task);
        }}
        className="shrink-0 rounded-md px-2 py-1.5 text-[#546274] opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
