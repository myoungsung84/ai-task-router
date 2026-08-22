/**
 * The web app's single import point for the shared domain model — screens
 * import from here, never from `@ai-task-router/shared` directly, so the
 * package boundary is crossed in exactly one file.
 *
 * Deliberately a full re-export of the domain vocabulary rather than only
 * the names in use today: these are types the server already sends over the
 * wire, so listing one costs nothing at runtime (a type re-export emits no
 * JS) and keeps the boundary from being edited on every new component. The
 * one thing kept *out* is the Workflow **preset** vocabulary
 * (`WORKFLOW_PRESETS`/`WorkflowPreset`/`WorkflowPresetId`): the custom
 * workflow editor that used it is gone, and `shared` marks it `@deprecated`,
 * retained only so old persisted tasks and un-updated MCP callers keep
 * typechecking. Nothing in the web app should reach for it again.
 */
export type {
  Task,
  TaskListItem,
  TaskStatus,
  StatusGroup,
  LogEntry,
  LogSource,
  LogStream,
  AgentName,
  StepAction,
  StepPermission,
  StepStatus,
  SkipReason,
  Workflow,
  WorkflowStep,
  WorkflowStepResult,
  WorkflowSpec,
  WorkflowStepSpec,
  ReviewIssue,
  ReviewIssueSeverity,
  ReviewIssueCategory,
  ReviewOutcome,
  CreateTaskInput,
  TaskGitInfo,
  ChangedFile,
  TaskDiff,
  TaskEvent,
  TaskLinkKind,
  TaskPurpose,
  TaskRole,
  RoleConfig,
  RoleOverride,
  RoleSettings,
  Settings,
} from "@ai-task-router/shared";

export {
  TASK_ROLES,
  DEFAULT_ROLE_SETTINGS,
  statusGroupOf,
  isTerminalStatus,
  generateTitleFromInstruction,
  resolveWorkflowSpecForPurpose,
  rolesForPurpose,
  compareReviewIssueSeverity,
  maxReviewIssueSeverity,
  securityIssuesOf,
  securityReviewLevelOf,
  hasBlockingSecurityIssue,
} from "@ai-task-router/shared";
