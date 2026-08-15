/**
 * Shared types between apps/server and apps/web.
 * Kept intentionally flat — this is the contract the future MCP layer
 * (create_task / start_task / cancel_task / get_task / list_tasks / get_task_result)
 * will also speak.
 */

export type TaskStatus =
  "QUEUED" | "RUNNING" | "REVIEWING" | "READY" | "WARNING" | "FAILED" | "CANCELLED";

/** Fine-grained status of each runner, shown separately in the dashboard. */
export type RunnerStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED" | "CANCELLED";

export type LogSource = "system" | "claude" | "codex";
export type LogStream = "stdout" | "stderr" | "info";

export interface LogEntry {
  id: string;
  source: LogSource;
  stream: LogStream;
  text: string;
  timestamp: string; // ISO
}

export interface ClaudeResult {
  exitCode: number | null;
  success: boolean;
  /** Last chunk of Claude's own output, for a quick glance without opening full logs. */
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
}

export type CodexIssueSeverity = "low" | "medium" | "high";

export interface CodexIssue {
  severity: CodexIssueSeverity;
  file: string;
  message: string;
}

export interface CodexReviewResult {
  result: "PASS" | "WARNING";
  issues: CodexIssue[];
  /** Raw text Codex produced, kept for debugging when structured parsing fails partially. */
  raw?: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** Snapshot of the git situation captured right before Claude starts. */
export interface TaskGitInfo {
  originalBranch: string | null;
  requestedBaseBranch: string | null;
  requestedBranch: string | null;
  resolvedBranch: string | null;
  branchCreated: boolean;
  hadUncommittedChangesBeforeStart: boolean;
}

export interface Task {
  id: string;
  title: string;
  projectPath: string;
  instruction: string;
  baseBranch: string | null;
  branch: string | null;
  status: TaskStatus;
  claudeStatus: RunnerStatus;
  codexStatus: RunnerStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  claudeResult: ClaudeResult | null;
  codexReviewResult: CodexReviewResult | null;
  logs: LogEntry[];
  error: string | null;
  gitInfo: TaskGitInfo | null;
}

/** List view omits the (potentially large) logs array. */
export type TaskListItem = Omit<Task, "logs">;

export interface CreateTaskInput {
  title: string;
  projectPath: string;
  instruction: string;
  baseBranch?: string | null;
  branch?: string | null;
}

export interface ChangedFile {
  path: string;
  status: string; // e.g. "M", "A", "D", "??"
}

export interface TaskDiff {
  changedFiles: ChangedFile[];
  diff: string;
}

export type TaskEvent =
  | { type: "task"; task: Task }
  | { type: "log"; log: LogEntry }
  | {
      type: "status";
      status: TaskStatus;
      claudeStatus: RunnerStatus;
      codexStatus: RunnerStatus;
    }
  | { type: "end" };

export const TERMINAL_STATUSES: TaskStatus[] = ["READY", "WARNING", "FAILED", "CANCELLED"];

export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
