import type { ChangedFile, Task, TaskListItem } from "@ai-task-router/shared";
import { config } from "../../config";

/** Default cap on how much diff text a single MCP tool response will carry. */
export const DEFAULT_MAX_DIFF_CHARS = 20000;

/** Uses the Job ID (e.g. "T-1042") — friendlier than the UUID, and the dashboard's task route resolves either identifier so this always works. */
export function dashboardTaskUrl(task: Pick<Task, "jobId">): string {
  return `${config.webOrigin}/tasks/${task.jobId}`;
}

/** Reconstructs a `git status --porcelain`-style summary from already-computed changed files, without spawning git a second time. */
export function changedFilesToStatusText(changedFiles: ChangedFile[]): string {
  if (changedFiles.length === 0) return "(변경된 파일 없음)";
  return changedFiles.map((f) => `${f.status} ${f.path}`).join("\n");
}

export function truncateDiff(
  diff: string,
  maxChars: number,
): { diff: string; truncated: boolean; originalLength: number } {
  if (diff.length <= maxChars) {
    return { diff, truncated: false, originalLength: diff.length };
  }
  return {
    diff: diff.slice(0, maxChars) + "\n... (생략됨)",
    truncated: true,
    originalLength: diff.length,
  };
}

/** Compact summary used by list_tasks — no logs, no full result payloads. */
export function toTaskListSummary(task: TaskListItem) {
  return {
    id: task.id,
    jobId: task.jobId,
    title: task.title,
    projectPath: task.projectPath,
    branch: task.branch,
    status: task.status,
    workflow: task.workflow,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    dashboardUrl: dashboardTaskUrl(task),
  };
}

/** get_task payload — status + results, deliberately excludes the full `logs` array. */
export function toTaskDetail(task: Task, changedFiles: ChangedFile[]) {
  return {
    id: task.id,
    jobId: task.jobId,
    title: task.title,
    projectPath: task.projectPath,
    baseBranch: task.baseBranch,
    branch: task.branch,
    status: task.status,
    workflow: task.workflow,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    error: task.error,
    changedFiles,
    dashboardUrl: dashboardTaskUrl(task),
  };
}
