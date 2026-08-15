import type { ChangedFile, Task, TaskListItem } from "@ai-task-router/shared";
import { config } from "../../config";

/** Default cap on how much diff text a single MCP tool response will carry. */
export const DEFAULT_MAX_DIFF_CHARS = 20000;

export function dashboardTaskUrl(taskId: string): string {
  return `${config.webOrigin}/tasks/${taskId}`;
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
    title: task.title,
    projectPath: task.projectPath,
    branch: task.branch,
    status: task.status,
    claudeStatus: task.claudeStatus,
    codexStatus: task.codexStatus,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    dashboardUrl: dashboardTaskUrl(task.id),
  };
}

/** get_task payload — status + results, deliberately excludes the full `logs` array. */
export function toTaskDetail(task: Task, changedFiles: ChangedFile[]) {
  return {
    id: task.id,
    title: task.title,
    projectPath: task.projectPath,
    baseBranch: task.baseBranch,
    branch: task.branch,
    status: task.status,
    claudeStatus: task.claudeStatus,
    codexStatus: task.codexStatus,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    error: task.error,
    claudeResult: task.claudeResult,
    codexReviewResult: task.codexReviewResult,
    changedFiles,
    dashboardUrl: dashboardTaskUrl(task.id),
  };
}
