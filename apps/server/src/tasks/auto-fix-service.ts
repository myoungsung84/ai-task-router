import type { ReviewOutcome, Task, WorkflowStep } from "@ai-task-router/shared";
import { autoFixBlockReasonOf, roleOverridesFromWorkflow } from "@ai-task-router/shared";
import { taskStore } from "./task-store";
import { taskService } from "./task-service";
import { settingsService } from "../settings/settings-service";
import { parseReviewJson } from "../runners/review-prompt";
import { buildAutoFixInstruction, reviewIssueSignature } from "./follow-up-builder";

/** The last review Step that actually ran (SUCCESS or FAILED) — mirrors task-service.ts's `resolveWarning` own selection so both agree on which review is "the" review to act on. */
function lastRanReviewStep(task: Task): WorkflowStep | undefined {
  const reviewSteps = task.workflow.steps.filter((s) => s.action === "review");
  for (let i = reviewSteps.length - 1; i >= 0; i--) {
    const step = reviewSteps[i];
    if (step && (step.status === "SUCCESS" || step.status === "FAILED")) return step;
  }
  return undefined;
}

/** Re-parses a Step's stored raw review JSON into a full `ReviewOutcome` — the same authoritative-trustworthy-review check `resolveWarning` uses, so an unparseable/synthetic fallback review is never treated as a real one. */
function reviewOutcomeOf(step: WorkflowStep | undefined): ReviewOutcome | null {
  const raw = step?.result?.review?.raw;
  if (!raw) return null;
  const parsed = parseReviewJson(raw);
  if (!parsed) return null;
  return {
    result: parsed.result,
    issues: parsed.issues,
    raw: parsed.raw,
    acceptanceCriteria: parsed.acceptanceCriteria,
    needsClarification: parsed.needsClarification,
    riskyChangeDetected: parsed.riskyChangeDetected,
  };
}

/**
 * Evaluates whether a just-finalized WARNING Task should get an automatic fix
 * follow-up Task, and creates+starts it if so. Called via `setImmediate` from
 * `task-executor.ts`'s `finalizeTerminal` — every Auto Loop 안전 규칙 (max
 * loops, Security HIGH/CRITICAL, ambiguous requirement, risky change,
 * stuck-repeat) is enforced here, in one place, before anything is created.
 *
 * Deliberately does nothing special for cancellation: a cancelled Task never
 * reaches `status === "WARNING"` (see `finalizeTerminal`'s caller), so this
 * function is simply never invoked for one — Auto Loop safety rules #6-#8
 * (parentTaskId/linkKind preserved, user can always cancel, existing CANCEL
 * behavior unchanged) hold for free because every automatic fix iteration is
 * just an ordinary Task with its own QUEUED/RUNNING lifecycle.
 */
export async function evaluateAndMaybeAutoFix(taskId: string): Promise<void> {
  const task = taskStore.get(taskId);
  if (!task || task.status !== "WARNING") return;

  const settings = settingsService.get();
  if (!settings.autoFixEnabled) return;

  const reviewStep = lastRanReviewStep(task);
  if (!reviewStep || reviewStep.status === "FAILED") {
    // No trustworthy review to act on — this is already the existing
    // REVIEW_FAILED case, not something Auto Fix can act on.
    return;
  }

  const review = reviewOutcomeOf(reviewStep);
  if (!review || review.result !== "WARNING") return;

  const loopCount = task.reviewLoopCount ?? 0;
  const maxLoops = settings.maxReviewLoops;
  const blockReason = autoFixBlockReasonOf(review, loopCount, maxLoops);
  if (blockReason === "LOOP_EXCEEDED") {
    taskStore.update(taskId, { reviewLoopExceeded: true });
    return;
  }
  if (blockReason) return; // SECURITY_BLOCKING / NEEDS_CLARIFICATION / RISKY_CHANGE — leave as ordinary WARNING for a person.

  // Auto Loop 안전 규칙 #5 — "동일 이슈가 반복되는데 개선되지 않으면 중단": a
  // single one-hop comparison against the immediate parent Task's own last
  // review, never walking the whole chain (that restriction is specifically
  // about loop *counting*, which `reviewLoopCount` already handles).
  if (task.parentTaskId) {
    const parent = taskStore.get(task.parentTaskId);
    const parentReview = parent ? reviewOutcomeOf(lastRanReviewStep(parent)) : null;
    if (
      parentReview &&
      parentReview.result === "WARNING" &&
      reviewIssueSignature(parentReview.issues) === reviewIssueSignature(review.issues)
    ) {
      taskStore.update(taskId, { reviewLoopExceeded: true });
      return;
    }
  }

  const previousFixInstruction = task.reviewLoopCount ? task.instruction : null;

  const instruction = buildAutoFixInstruction({
    task,
    review,
    iterationNumber: loopCount + 1,
    maxReviewLoops: maxLoops,
    previousFixInstruction,
  });

  try {
    const followUp = taskService.createTask({
      title: `[자동 수정 ${String(loopCount + 1)}/${String(maxLoops)}] ${task.title}`,
      projectPath: task.projectPath,
      instruction,
      baseBranch: task.baseBranch,
      branch: task.branch,
      purpose: "implement",
      roleOverrides: roleOverridesFromWorkflow(task.workflow.steps),
      parentTaskId: task.id,
      linkKind: "fix_and_rereview",
      acceptanceCriteria: task.acceptanceCriteria ?? null,
      reviewLoopCount: loopCount + 1,
    });
    await taskService.startTask(followUp.id);
  } catch (err) {
    // A genuine conflict (e.g. the project path is busy with something else
    // right now) leaves the follow-up Task QUEUED rather than crashing the
    // whole finalize path — it's already visible to the user, who can start
    // it manually, same as any other QUEUED Task.
    console.error(`[auto-fix-service] ${taskId} 자동 수정 Task 생성/시작 실패:`, err);
  }
}
