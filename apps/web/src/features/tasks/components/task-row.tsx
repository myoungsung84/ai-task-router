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

/** Compact row for the 확인 필요 / 완료 / 전체 groups — less visually loud than the running-task cards, but WARNING/FAILED still surface their headline issue inline. */
export function TaskRow({ task }: { task: TaskListItem }) {
  const issue = headline(task);
  return (
    <Link
      href={`/tasks/${task.jobId}`}
      className="block rounded-md border border-[#232c38] bg-[#121821] px-4 py-2.5 hover:border-[#33404f]"
    >
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
  );
}
