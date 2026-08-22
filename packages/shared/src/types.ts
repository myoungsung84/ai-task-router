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

/**
 * One completion condition for a Task — minimal on purpose (`id`+`text`
 * only; see `AcceptanceCriterionResult` for the per-review PASS/FAIL
 * grading, kept separate so the criteria themselves never get rewritten by
 * a later review run). Either supplied by the Task's creator (REST/MCP
 * `CreateTaskInput.acceptanceCriteria`) or, when omitted, derived by the
 * reviewing agent itself from the instruction on the first review — see
 * `buildReviewPrompt` — and then backfilled onto `Task.acceptanceCriteria`
 * once, so later review runs (fix/re-review loops) grade against the same
 * fixed set instead of each inventing its own.
 */
export interface AcceptanceCriterion {
  id: string;
  text: string;
}

/** One Acceptance Criterion's PASS/FAIL verdict from a single review run — lives on that run's `ReviewOutcome`, not on the Task itself, since a re-review can change the verdict without changing the criterion's `text`. */
export interface AcceptanceCriterionResult {
  id: string;
  result: "PASS" | "FAIL";
  /** Best-effort explanation from the reviewing agent. Omitted when it gave none. */
  reason?: string | null;
}

/** Structured outcome of a `review`-action step. */
export interface ReviewOutcome {
  result: "PASS" | "WARNING";
  issues: ReviewIssue[];
  /** Raw text the agent produced, kept for debugging when structured parsing fails partially. */
  raw?: string | null;
  /**
   * Per-Acceptance-Criterion PASS/FAIL from this review run. Optional/additive
   * — absent when the Task has no Acceptance Criteria (nothing to grade) or
   * on a review stored before this field existed. `parseReviewJson` forces
   * `result` to "WARNING" whenever any entry here is "FAIL", regardless of
   * what the agent itself answered for `result` — a required Criterion
   * failing can never coexist with an overall PASS.
   */
  acceptanceCriteria?: AcceptanceCriterionResult[] | null;
  /**
   * The reviewing agent's own explicit signal that this WARNING needs a
   * human decision rather than a mechanical fix — the requirement itself is
   * ambiguous, the user needs to choose between options, or two parts of the
   * instruction conflict. Only ever set from the agent's own structured
   * answer (see buildReviewPrompt) — never inferred/guessed from message
   * text — so it stays exactly as reliable as any other review field.
   */
  needsClarification?: boolean;
  /**
   * The reviewing agent's own explicit signal that fixing this WARNING would
   * plausibly require a risky change (DB migration, data/file deletion,
   * auth/permission changes, secret/env changes, deploy/infra changes) —
   * same "agent states it explicitly" contract as `needsClarification`. Used
   * to keep the Auto Fix Loop from attempting a fix on its own in that case.
   */
  riskyChangeDetected?: boolean;
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
export function compareReviewIssueSeverity(a: ReviewIssueSeverity, b: ReviewIssueSeverity): number {
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

/** Why the Auto Review/Fix Loop will not attempt (or continue) an automatic fix — every case here is Auto Loop 안전 규칙 1-4 (max loops, Security HIGH/CRITICAL, ambiguous requirement, risky change), in priority order. `null` means none of these apply (an automatic fix may be attempted, subject to Settings.autoFixEnabled). */
export type AutoFixBlockReason =
  "LOOP_EXCEEDED" | "SECURITY_BLOCKING" | "NEEDS_CLARIFICATION" | "RISKY_CHANGE";

/**
 * The single place every Auto Loop safety rule is checked before an
 * automatic fix Task is created — both the server's own orchestrator and
 * (should it ever need to explain "why not") any other caller reuse this
 * rather than re-deriving the same four conditions. `reviewLoopCount`/
 * `maxReviewLoops` are compared with `>=` (an original Task starts at 0, so
 * `maxReviewLoops: 2` allows exactly 2 automatic fix attempts before this
 * returns `"LOOP_EXCEEDED"`).
 */
export function autoFixBlockReasonOf(
  review: ReviewOutcome | null | undefined,
  reviewLoopCount: number,
  maxReviewLoops: number,
): AutoFixBlockReason | null {
  if (reviewLoopCount >= maxReviewLoops) return "LOOP_EXCEEDED";
  if (!review) return null;
  if (hasBlockingSecurityIssue(review.issues)) return "SECURITY_BLOCKING";
  if (review.needsClarification) return "NEEDS_CLARIFICATION";
  if (review.riskyChangeDetected) return "RISKY_CHANGE";
  return null;
}

/**
 * Plain-text bullet rendering of a set of Review Issues — the one place this
 * exists so the web "후속 작업" prefill (`follow-up.ts`) and the server's own
 * Auto Fix follow-up instruction builder never duplicate the same
 * `- [severity] file:location: message (제안: ...)` formatting.
 */
export function formatReviewIssuesAsText(issues: ReviewIssue[]): string {
  if (issues.length === 0) {
    return "(세부 이슈 없음 — 리뷰 실행 자체가 실패했을 수 있습니다. 로그를 확인하세요.)";
  }
  return issues
    .map((i) => {
      const where = [i.file, i.location].filter(Boolean).join(":");
      const suggestion = i.suggestion ? ` (제안: ${i.suggestion})` : "";
      return `- [${i.severity}] ${where ? `${where}: ` : ""}${i.message}${suggestion}`;
    })
    .join("\n");
}

/**
 * Carries forward the exact Agent/model each Role used in `task`'s own
 * Workflow, as a `roleOverrides` map for a follow-up Task — so a follow-up
 * (manual or automatic) never silently switches Agent just because Settings'
 * defaults changed since the original ran. Shared by the web "후속 작업"
 * prefill and the server's Auto Fix orchestrator, neither of which may import
 * the other's platform-specific code.
 */
export function roleOverridesFromWorkflow(
  steps: Pick<WorkflowStep, "action" | "agent" | "model">[],
): Partial<Record<TaskRole, RoleOverride>> {
  const overrides: Partial<Record<TaskRole, RoleOverride>> = {};
  for (const step of steps) {
    const role: TaskRole | null =
      step.action === "implement"
        ? "implementer"
        : step.action === "analyze"
          ? "analyzer"
          : "reviewer";
    if (role && !overrides[role])
      overrides[role] = { agent: step.agent, model: step.model ?? null };
  }
  return overrides;
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

  /**
   * This Task's completion conditions — either supplied at creation, or (when
   * omitted) left `null`/empty until the first review run derives and
   * backfills them (see `AcceptanceCriterion`, `buildReviewPrompt`). A
   * fix/re-review follow-up carries its parent's set forward unchanged, so
   * every review in the same chain grades against the same Criteria.
   */
  acceptanceCriteria?: AcceptanceCriterion[] | null;
  /**
   * How many automatic Auto Fix Loop iterations produced this Task — 0 (or
   * absent) for every user/MCP-created Task, including a *manually* created
   * "수정 후 재검토" follow-up. Only the server's own Auto Fix orchestrator
   * ever sets this above 0, which doubles as "was this Task auto-created" —
   * an explicit stored count rather than something re-derived by walking
   * `parentTaskId` every time (see `autoFixBlockReasonOf`).
   */
  reviewLoopCount?: number;
  /** Set (once, true) by the Auto Fix orchestrator when this WARNING Task's own chain has already used up `Settings.maxReviewLoops` automatic attempts — the one authoritative signal the web UI's Needs Attention reason ("REVIEW_LOOP_EXCEEDED") reads, instead of re-comparing `reviewLoopCount` against Settings itself. */
  reviewLoopExceeded?: boolean;
  /** Changed-file count captured once at Task completion (best-effort — omitted if git couldn't be queried at that moment), reused by the Daily Summary so it never has to re-run git per Task per view. */
  changedFilesCount?: number;

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
  /** This Task's completion conditions — optional; omit to let the first review run derive them from `instruction` instead (see `Task.acceptanceCriteria`). */
  acceptanceCriteria?: AcceptanceCriterion[] | null;
  /** Internal — set only by the server's own Auto Fix orchestrator when it creates a follow-up Task; not part of the REST/MCP `taskSpecShape` input, so an external caller can never set this directly. */
  reviewLoopCount?: number;
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
  /**
   * Auto Review/Fix Loop — off by default. When true, a WARNING Task whose
   * review is a plain fixable WARNING (no blocking Security issue, no
   * `needsClarification`/`riskyChangeDetected`, and under `maxReviewLoops`
   * attempts so far — see `autoFixBlockReasonOf`) automatically gets a
   * `fix_and_rereview` follow-up Task created and started, instead of
   * waiting for a person to do it from the Task Detail screen.
   */
  autoFixEnabled: boolean;
  /** Maximum automatic fix attempts in one chain before the Auto Fix Loop stops and leaves the Task as an ordinary WARNING for a person (see `Task.reviewLoopExceeded`). Global for now — no per-Project/Task override. */
  maxReviewLoops: number;
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
  autoFixEnabled: false,
  maxReviewLoops: 2,
};

// ---------------------------------------------------------------------------
// Daily History / Digest — a date-based (Asia/Seoul) aggregation over
// `taskStore.list()`, computed on demand by the server (see
// `daily-summary-service.ts`), never stored — so this shape is purely a wire
// contract between that endpoint and the Dashboard's "오늘 요약" view.
// ---------------------------------------------------------------------------

/** One Task as needed for a Daily Summary's "주요 작업 목록" — deliberately just enough to link to it and show its outcome, not the full `Task`. */
export interface DailySummaryTaskRef {
  jobId: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface DailySummary {
  /** `YYYY-MM-DD`, Asia/Seoul calendar date this summary covers. */
  date: string;
  totalTasks: number;
  completed: number;
  needsAttention: number;
  failed: number;
  claudeRuns: number;
  codexReviews: number;
  securityHigh: number;
  securityCritical: number;
  autoFixRuns: number;
  changedFilesCount: number;
  /** Sum of `completedAt - startedAt` across every Task that has both, in ms. `null` when no Task that day has both timestamps. */
  totalDurationMs: number | null;
  tasks: DailySummaryTaskRef[];
  /** Deterministic (non-AI) Korean sentence summarizing the above — see `daily-summary-service.ts`. */
  narrativeSummary: string;
}
