/**
 * Shared types between apps/server and apps/web.
 * Kept intentionally flat — this is the contract the MCP layer
 * (run_task / run_tasks / list_tasks / get_task / get_task_result / cancel_task)
 * also speaks.
 */

export type TaskStatus =
  "QUEUED" | "RUNNING" | "REVIEWING" | "READY" | "WARNING" | "FAILED" | "CANCELLED";

/** @deprecated Per-runner status from the old fixed Claude→Codex pipeline. Kept only for reading legacy stored tasks; new code reads `workflow.steps[].status` instead. */
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

// ---------------------------------------------------------------------------
// Workflow: a Task runs an ordered list of Steps. An Agent (claude/codex) is
// no longer pinned to a fixed role (Claude=implement, Codex=review) — each
// Step independently declares which agent runs it, what it does, and
// whether it may write files.
// ---------------------------------------------------------------------------

export type AgentName = "claude" | "codex";
export type StepAction = "implement" | "analyze" | "review";
export type StepPermission = "write" | "read-only";
export type StepStatus = "PENDING" | "RUNNING" | "SUCCESS" | "SKIPPED" | "FAILED" | "CANCELLED";

/** Why a step was skipped. NO_CHANGES = review step skipped, no diff to review. LEGACY = backfilled from a pre-workflow stored task, real reason unknown. */
export type SkipReason = "NO_CHANGES" | "LEGACY";

export type ReviewIssueSeverity = "low" | "medium" | "high";

export interface ReviewIssue {
  severity: ReviewIssueSeverity;
  file: string;
  /** Best-effort line/location text the reviewing agent reported (e.g. "L42", "12-18"). Omitted when the agent wasn't confident. */
  location?: string | null;
  message: string;
  /** Best-effort concrete fix suggestion from the reviewing agent. Omitted when none was given. */
  suggestion?: string | null;
}

/** Structured outcome of a `review`-action step. */
export interface ReviewOutcome {
  result: "PASS" | "WARNING";
  issues: ReviewIssue[];
  /** Raw text the agent produced, kept for debugging when structured parsing fails partially. */
  raw?: string | null;
}

export interface WorkflowStepResult {
  exitCode: number | null;
  success: boolean;
  /** Last chunk of the agent's own output, for a quick glance without opening full logs. */
  summary: string | null;
  /** Present only for `review`-action steps. */
  review?: ReviewOutcome | null;
}

export interface WorkflowStep {
  id: string;
  order: number;
  agent: AgentName;
  action: StepAction;
  permission: StepPermission;
  status: StepStatus;
  startedAt: string | null;
  completedAt: string | null;
  result: WorkflowStepResult | null;
  error: string | null;
  skipReason: SkipReason | null;
}

export interface Workflow {
  steps: WorkflowStep[];
}

/** Minimal spec for building a Workflow — used by Settings, Task creation input, and MCP. */
export interface WorkflowStepSpec {
  agent: AgentName;
  action: StepAction;
  permission: StepPermission;
}

export interface WorkflowSpec {
  steps: WorkflowStepSpec[];
}

export type WorkflowPresetId = "default_dev" | "analyze_only" | "no_review" | "custom";

export interface WorkflowPreset {
  id: WorkflowPresetId;
  label: string;
  description: string;
  /** null only for "custom" — there is no fixed step list to preview. */
  workflow: WorkflowSpec | null;
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: "default_dev",
    label: "기본 개발",
    description: "Claude가 구현하고 Codex가 리뷰합니다.",
    workflow: {
      steps: [
        { agent: "claude", action: "implement", permission: "write" },
        { agent: "codex", action: "review", permission: "read-only" },
      ],
    },
  },
  {
    id: "analyze_only",
    label: "분석만",
    description: "Claude가 읽기 전용으로 분석만 하고 아무것도 수정하지 않습니다.",
    workflow: { steps: [{ agent: "claude", action: "analyze", permission: "read-only" }] },
  },
  {
    id: "no_review",
    label: "리뷰 없음",
    description: "Claude가 구현만 하고 리뷰 Step 없이 끝냅니다.",
    workflow: { steps: [{ agent: "claude", action: "implement", permission: "write" }] },
  },
  {
    id: "custom",
    label: "Custom",
    description: "Step을 직접 구성합니다.",
    workflow: null,
  },
];

export function findWorkflowPreset(id: WorkflowPresetId): WorkflowPreset | undefined {
  return WORKFLOW_PRESETS.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Legacy (pre-workflow) result shapes. No longer written by new Tasks, but
// kept so already-stored JSON keeps typechecking and old data stays
// readable. New code should read `Task.workflow.steps` instead.
// ---------------------------------------------------------------------------

/** @deprecated use WorkflowStepResult (agent=claude implement step) */
export interface ClaudeResult {
  exitCode: number | null;
  success: boolean;
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** @deprecated use ReviewIssueSeverity */
export type CodexIssueSeverity = ReviewIssueSeverity;
/** @deprecated use ReviewIssue */
export type CodexIssue = ReviewIssue;

/** @deprecated use WorkflowStepResult.review (agent=codex review step) */
export interface CodexReviewResult {
  result: "PASS" | "WARNING";
  issues: CodexIssue[];
  raw?: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** Snapshot of the git situation captured right before the first Step starts. */
export interface TaskGitInfo {
  originalBranch: string | null;
  requestedBaseBranch: string | null;
  requestedBranch: string | null;
  resolvedBranch: string | null;
  branchCreated: boolean;
  hadUncommittedChangesBeforeStart: boolean;
}

/**
 * How a Task was derived from its `parentTaskId` — lets the Task Detail
 * screen render the origin→follow-up chain (e.g. "T-1 원본 → T-2 리뷰 수정 →
 * T-3 재검토") with an accurate label per hop. Only ever set at creation
 * time; never changes afterward.
 */
export type TaskLinkKind = "fix_and_rereview" | "review_only" | "rerun";

export interface Task {
  id: string;
  /** Short, human-friendly, permanent identifier (e.g. "T-1042"). Safe to use in chat/MCP/Dashboard instead of the UUID. */
  jobId: string;
  title: string;
  projectPath: string;
  instruction: string;
  baseBranch: string | null;
  branch: string | null;
  status: TaskStatus;
  workflow: Workflow;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  logs: LogEntry[];
  error: string | null;
  gitInfo: TaskGitInfo | null;
  /** Set when this Task was created as a WARNING follow-up of another Task (see TaskLinkKind). null for an original Task. */
  parentTaskId: string | null;
  /** Present only when parentTaskId is set — describes what kind of follow-up this is. */
  linkKind: TaskLinkKind | null;

  /** @deprecated legacy fixed-pipeline fields — undefined/null on every new Task, populated only when a pre-workflow stored Task is loaded. Do not read these in new code; use `workflow.steps` instead. */
  claudeStatus?: RunnerStatus;
  /** @deprecated see claudeStatus */
  codexStatus?: RunnerStatus;
  /** @deprecated see claudeStatus */
  claudeResult?: ClaudeResult | null;
  /** @deprecated see claudeStatus */
  codexReviewResult?: CodexReviewResult | null;
}

/** List view omits the (potentially large) logs array. */
export type TaskListItem = Omit<Task, "logs">;

export interface CreateTaskInput {
  /** Omit (or send empty) to have the server generate a title from `instruction` — see `generateTitleFromInstruction`. */
  title?: string;
  projectPath: string;
  instruction: string;
  baseBranch?: string | null;
  branch?: string | null;
  /** Omit to fall back to this project's last-remembered Workflow, then Settings' default. */
  workflow?: WorkflowSpec | null;
  /** Set when this Task is a WARNING follow-up created from another Task. */
  parentTaskId?: string | null;
  linkKind?: TaskLinkKind | null;
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
  | { type: "status"; status: TaskStatus; workflow: Workflow }
  | { type: "end" };

export const TERMINAL_STATUSES: TaskStatus[] = ["READY", "WARNING", "FAILED", "CANCELLED"];

export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Dashboard-level grouping used for the main filter (작업 중 / 확인 필요 / 완료 / 전체). */
export type StatusGroup = "active" | "attention" | "done";

const ACTIVE_STATUSES: TaskStatus[] = ["QUEUED", "RUNNING", "REVIEWING"];
const ATTENTION_STATUSES: TaskStatus[] = ["WARNING", "FAILED"];
// The third group, "done", is every remaining status (READY, CANCELLED) —
// expressed as the fallback below rather than a third list to check.

export function statusGroupOf(status: TaskStatus): StatusGroup {
  if (ACTIVE_STATUSES.includes(status)) return "active";
  if (ATTENTION_STATUSES.includes(status)) return "attention";
  return "done";
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface Settings {
  defaultWorkflow: WorkflowSpec;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultWorkflow: findWorkflowPreset("default_dev")!.workflow!,
};
