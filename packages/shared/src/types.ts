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

export type ReviewIssueSeverity = "low" | "medium" | "high" | "critical";

/**
 * What kind of concern an Issue is about — additive alongside `severity`
 * (how bad) so a Security problem can be told apart from ordinary review
 * feedback. Kept deliberately small (not one category per review-prompt
 * bullet point): `SECURITY` is the one category anything downstream (Needs
 * Attention, the AI handoff copy, a future Auto Fix Loop gate) actually
 * treats differently today, `REQUIREMENT` covers "지시사항 대비 누락",
 * `CODE_QUALITY` is everything else the review prompt's normal checklist
 * catches (버그/타입/null 처리/회귀 등), and `OTHER` is the deliberate
 * catch-all — most importantly for the parse-failure synthetic Issue (see
 * claude-runner.ts/codex-runner.ts), which must never be mistaken for a real
 * Security finding.
 *
 * Optional on `ReviewIssue` and additive-only: a stored Issue from before
 * this field existed simply has `category: undefined`, which every reader
 * here (securityIssuesOf, ReviewPanel, attentionReasonOf) already treats as
 * "not Security" — no migration needed for old task.json data.
 */
export type ReviewIssueCategory = "SECURITY" | "CODE_QUALITY" | "REQUIREMENT" | "OTHER";

export interface ReviewIssue {
  severity: ReviewIssueSeverity;
  file: string;
  /** Best-effort line/location text the reviewing agent reported (e.g. "L42", "12-18"). Omitted when the agent wasn't confident. */
  location?: string | null;
  message: string;
  /** Best-effort concrete fix suggestion from the reviewing agent. Omitted when none was given. */
  suggestion?: string | null;
  /** What this Issue is about (see `ReviewIssueCategory`). Optional/additive — absent on Issues stored before this field existed, or when the agent's own answer didn't parse to a known category. */
  category?: ReviewIssueCategory | null;
}

/** Structured outcome of a `review`-action step. */
export interface ReviewOutcome {
  result: "PASS" | "WARNING";
  issues: ReviewIssue[];
  /** Raw text the agent produced, kept for debugging when structured parsing fails partially. */
  raw?: string | null;
}

// ---------------------------------------------------------------------------
// Review severity/category helpers — the one place severity is ranked and
// Security issues are picked out, so no caller (web UI today; a future Auto
// Fix Loop gate later) re-implements "LOW < MEDIUM < HIGH < CRITICAL" or
// "what counts as Security" on its own. All take a plain `ReviewIssue[]` —
// callers flatten across `workflow.steps[].result.review.issues` themselves,
// since a Task can have more than one review Step.
// ---------------------------------------------------------------------------

const REVIEW_SEVERITY_RANK: Record<ReviewIssueSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Never compare `ReviewIssueSeverity` values by string/alphabetical order — this is the one place the LOW < MEDIUM < HIGH < CRITICAL ranking lives. */
export function compareReviewIssueSeverity(
  a: ReviewIssueSeverity,
  b: ReviewIssueSeverity,
): number {
  return REVIEW_SEVERITY_RANK[a] - REVIEW_SEVERITY_RANK[b];
}

/** Highest severity present in `issues`, or `null` for an empty list. */
export function maxReviewIssueSeverity(issues: ReviewIssue[]): ReviewIssueSeverity | null {
  let max: ReviewIssueSeverity | null = null;
  for (const issue of issues) {
    if (max === null || compareReviewIssueSeverity(issue.severity, max) > 0) max = issue.severity;
  }
  return max;
}

/** Just the Security-category Issues out of a set — `category` is optional, so an Issue stored before this field existed (or a parse-failure fallback Issue, always `OTHER`) is never included here. */
export function securityIssuesOf(issues: ReviewIssue[]): ReviewIssue[] {
  return issues.filter((i) => i.category === "SECURITY");
}

/** Highest severity among `issues`' Security-category Issues, or `null` when there are none — the single place "이 Task의 Security 심각도" is computed. */
export function securityReviewLevelOf(issues: ReviewIssue[]): ReviewIssueSeverity | null {
  return maxReviewIssueSeverity(securityIssuesOf(issues));
}

/**
 * HIGH/CRITICAL Security issues are the ones meant to require a person's
 * attention rather than being auto-resolvable — not enforced as a gate
 * anywhere yet (`task-service.ts`'s `resolveWarning` deliberately still lets
 * the user complete over any severity, see its own comment), but centralized
 * here for a future Auto Review/Fix Loop to check.
 */
export function hasBlockingSecurityIssue(issues: ReviewIssue[]): boolean {
  const level = securityReviewLevelOf(issues);
  return level === "high" || level === "critical";
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
  /** CLI model override for this Step (e.g. "sonnet", "opus"). null/undefined = the agent CLI's own default. */
  model?: string | null;
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
  /** CLI model override for this Step. Omit/null = the agent CLI's own default. */
  model?: string | null;
}

export interface WorkflowSpec {
  steps: WorkflowStepSpec[];
}

/** @deprecated presets belong to the removed Custom Workflow editor; new code drives Workflow construction from `TaskPurpose` + role Settings (see `resolveWorkflowSpecForPurpose` in `workflow-purpose.ts`). Kept only so a `Task.workflow` persisted by an old build, or a `workflow` still passed explicitly by an un-updated MCP caller, keeps typechecking. */
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
// Task purpose & roles — replaces hand-assembled Workflow Steps as the thing
// a Task creator (web UI or MCP caller) actually declares. `TaskPurpose` is
// the same three values as `StepAction` (kept as a distinct name because it
// describes the *whole Task's* intent, not one Step), and the server turns
// it into a full Workflow via `resolveWorkflowSpecForPurpose` (workflow-purpose.ts),
// using each Role's Agent/model from Settings unless a per-Task override is
// given. Permission is never client-controlled — the server derives it from
// purpose/role every time (implement's own Step is "write", everything else
// "read-only").
// ---------------------------------------------------------------------------

export type TaskPurpose = StepAction;

/** The three jobs a Task's Workflow can be made of. Each maps to exactly one Settings-configurable Agent+model. */
export type TaskRole = "implementer" | "analyzer" | "reviewer";

export const TASK_ROLES: TaskRole[] = ["implementer", "analyzer", "reviewer"];

export interface RoleConfig {
  agent: AgentName;
  /** CLI model override for this role's Steps. null/undefined = the agent CLI's own default. */
  model?: string | null;
}

/** Per-Task, per-Role override — set only for the Role(s) actually used by that Task's purpose. Never changes `permission`. */
export interface RoleOverride {
  agent?: AgentName;
  model?: string | null;
}

export type RoleSettings = Record<TaskRole, RoleConfig>;

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
  /**
   * What this Task is for — determines its Workflow: `implement` runs the
   * implementer Role (write) then the reviewer Role (read-only);
   * `analyze`/`review` run only the analyzer/reviewer Role, read-only.
   * Required for new callers (web UI always sends it). Omitted only by
   * not-yet-updated MCP callers — the server falls back to `implement` in
   * that case (see taskService.createTask) rather than rejecting the call.
   */
  purpose?: TaskPurpose;
  /** Per-Task Agent/model override for one or more Roles used by `purpose`. Omit to use Settings' Role defaults. */
  roleOverrides?: Partial<Record<TaskRole, RoleOverride>> | null;
  /** @deprecated Legacy escape hatch: an explicit Workflow bypasses `purpose`/`roleOverrides` entirely and runs exactly these Steps. Still fully supported (old stored Tasks and not-yet-updated external callers keep working), but the web UI no longer sends this — prefer `purpose`. */
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
  /** Agent + model for each of the three Roles — what `resolveWorkflowSpecForPurpose` builds a Task's Workflow from when the Task itself doesn't override a Role. */
  roles: RoleSettings;
  /** @deprecated pre-Role Settings shape (a single hand-built default Workflow). Kept only so an already-stored settings.json keeps typechecking; `settings-store.ts` migrates it into `roles` on load and never writes it again. */
  defaultWorkflow?: WorkflowSpec;
}

/** `Claude 구현 → Codex 리뷰` — the recommended starting point, not a fixed pairing; every Role is independently editable in Settings. */
export const DEFAULT_ROLE_SETTINGS: RoleSettings = {
  // "sonnet"/"opus"/"haiku" are the Claude CLI's own stable tier aliases
  // (see apps/web's model catalog) — used here (not a dated snapshot id) so
  // the recommended default never goes stale. Codex has no equivalent
  // stable alias, so its default is `null` ("let the CLI pick"), matching
  // its own catalog's recommended card.
  implementer: { agent: "claude", model: "sonnet" },
  analyzer: { agent: "claude", model: "sonnet" },
  reviewer: { agent: "codex", model: null },
};

export const DEFAULT_SETTINGS: Settings = {
  roles: DEFAULT_ROLE_SETTINGS,
};
