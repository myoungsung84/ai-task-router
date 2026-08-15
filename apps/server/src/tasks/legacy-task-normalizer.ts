import { v4 as uuid } from "uuid";
import type {
  ClaudeResult,
  CodexReviewResult,
  RunnerStatus,
  StepStatus,
  Task,
  Workflow,
  WorkflowStep,
} from "@ai-task-router/shared";

/**
 * Shape of a Task as it may still exist on disk from before the Workflow
 * model existed: no `workflow`, agent-fixed `claudeStatus`/`codexStatus` +
 * `claudeResult`/`codexReviewResult` instead. `Partial` because we're
 * reading untyped JSON off disk — every field we depend on is checked.
 */
export type StoredTaskRecord = Partial<Task> & {
  claudeStatus?: RunnerStatus;
  codexStatus?: RunnerStatus;
  claudeResult?: ClaudeResult | null;
  codexReviewResult?: CodexReviewResult | null;
};

function toStepStatus(status: RunnerStatus | undefined): StepStatus {
  switch (status) {
    case "RUNNING":
    case "SUCCESS":
    case "FAILED":
    case "SKIPPED":
    case "CANCELLED":
      return status;
    default:
      return "PENDING";
  }
}

/**
 * Synthesizes a `workflow.steps` (Claude implement -> Codex review, the only
 * shape that ever existed pre-Workflow) from a legacy stored Task's fixed
 * fields. Never touches `logs`, `claudeResult`/`codexReviewResult` content,
 * or the task's UUID — purely additive, so old data is never lost even
 * though new code reads `workflow.steps` instead of the old fields.
 */
export function buildLegacyWorkflow(record: StoredTaskRecord): Workflow {
  const claudeResult = record.claudeResult ?? null;
  const codexReviewResult = record.codexReviewResult ?? null;

  const implementStep: WorkflowStep = {
    id: uuid(),
    order: 1,
    agent: "claude",
    action: "implement",
    permission: "write",
    status: toStepStatus(record.claudeStatus),
    startedAt: claudeResult?.startedAt ?? record.startedAt ?? null,
    completedAt: claudeResult?.completedAt ?? null,
    result: claudeResult
      ? {
          exitCode: claudeResult.exitCode,
          success: claudeResult.success,
          summary: claudeResult.summary,
          review: null,
        }
      : null,
    error: record.claudeStatus === "FAILED" ? (record.error ?? null) : null,
    skipReason: record.claudeStatus === "SKIPPED" ? "LEGACY" : null,
  };

  const reviewStep: WorkflowStep = {
    id: uuid(),
    order: 2,
    agent: "codex",
    action: "review",
    permission: "read-only",
    status: toStepStatus(record.codexStatus),
    startedAt: codexReviewResult?.startedAt ?? null,
    completedAt: codexReviewResult?.completedAt ?? null,
    result: codexReviewResult
      ? {
          exitCode: null,
          success: true,
          summary: null,
          review: {
            result: codexReviewResult.result,
            issues: codexReviewResult.issues,
            raw: codexReviewResult.raw ?? null,
          },
        }
      : null,
    error: record.codexStatus === "FAILED" ? (record.error ?? null) : null,
    skipReason: record.codexStatus === "SKIPPED" ? "LEGACY" : null,
  };

  return { steps: [implementStep, reviewStep] };
}

export function needsLegacyMigration(record: StoredTaskRecord): boolean {
  return !record.workflow || !record.jobId;
}
