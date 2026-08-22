import { v4 as uuid } from "uuid";
import type {
  LogEntry,
  LogSource,
  LogStream,
  Task,
  TaskStatus,
  Workflow,
  WorkflowStep,
} from "@ai-task-router/shared";
import { taskStore } from "./task-store";
import { taskEventBus } from "../stream/event-bus";
import { prepareGitState, GitError, getChangedFiles } from "../git/git-manager";
import { runWorkflowStep } from "../runners/agent-runner";
import { parseAcceptanceCriteriaDefinitions } from "../runners/review-prompt";
import { notifier } from "../notifications/notifier";
import { generateHistoryForTask } from "../history/history-service";
import { evaluateAndMaybeAutoFix } from "./auto-fix-service";

interface ActiveRun {
  projectPathKey: string;
  cancel: () => void;
  cancelled: boolean;
}

/** taskId -> currently running process handle, used by cancel + the same-project guard. */
export const activeRuns = new Map<string, ActiveRun>();

function makeLog(source: LogSource, stream: LogStream, text: string): LogEntry {
  return { id: uuid(), source, stream, text, timestamp: new Date().toISOString() };
}

function emitLog(taskId: string, entry: LogEntry): void {
  taskStore.appendLog(taskId, entry);
  taskEventBus.publish(taskId, { type: "log", log: entry });
}

/** Task-status-only transition — the current workflow is unchanged. */
function commitTaskStatus(
  taskId: string,
  status: TaskStatus,
  extra: Partial<Task> = {},
): Task | undefined {
  const updated = taskStore.update(taskId, { status, ...extra });
  if (updated) taskEventBus.publish(taskId, { type: "status", status, workflow: updated.workflow });
  return updated;
}

/** Updates one Step within the Task's workflow, and the Task's overall status, in a single store write. */
function commitStep(
  taskId: string,
  stepId: string,
  stepPatch: Partial<WorkflowStep>,
  taskStatus: TaskStatus,
  extra: Partial<Task> = {},
): Task | undefined {
  const task = taskStore.get(taskId);
  if (!task) return undefined;
  const workflow: Workflow = {
    steps: task.workflow.steps.map((s) => (s.id === stepId ? { ...s, ...stepPatch } : s)),
  };
  const updated = taskStore.update(taskId, { status: taskStatus, workflow, ...extra });
  if (updated) taskEventBus.publish(taskId, { type: "status", status: taskStatus, workflow });
  return updated;
}

function notifyTerminal(task: Task): void {
  if (task.status !== "READY" && task.status !== "WARNING" && task.status !== "FAILED") return;
  const labels: Record<string, string> = {
    READY: "✅ READY",
    WARNING: "⚠ WARNING",
    FAILED: "❌ FAILED",
  };
  notifier.notify({
    title: `[ai-task-router] ${labels[task.status]}`,
    message: `${task.jobId} ${task.title} (${task.projectPath})`,
  });
}

/**
 * Finalizes a Task into a terminal status: commits the status, best-effort
 * captures `changedFilesCount` (for the Daily Summary, so it never has to
 * re-run git per Task per view), notifies, writes history, and — only for
 * WARNING — hands off to the Auto Review/Fix Loop via `setImmediate`.
 *
 * `setImmediate` is required, not just style: this function is called from
 * inside `executeTask`'s own `try` block, and `activeRuns.delete(taskId)`
 * only runs in `executeTask`'s `finally` block, *after* this whole call
 * returns. Evaluating Auto Fix synchronously here would let its own
 * `isProjectPathBusy` check see this Task's still-active entry and wrongly
 * report the project as busy; deferring to the next event-loop turn
 * guarantees `finally` has already run.
 */
async function finalizeTerminal(
  taskId: string,
  status: TaskStatus,
  extra: Partial<Task> = {},
): Promise<void> {
  const task = taskStore.get(taskId);
  let changedFilesCount: number | undefined;
  if (task) {
    try {
      changedFilesCount = (await getChangedFiles(task.projectPath)).length;
    } catch {
      changedFilesCount = undefined;
    }
  }

  const updated = commitTaskStatus(taskId, status, {
    completedAt: new Date().toISOString(),
    ...(changedFilesCount !== undefined ? { changedFilesCount } : {}),
    ...extra,
  });
  if (!updated) return;
  notifyTerminal(updated);
  void generateHistoryForTask(updated).catch((err) => {
    console.error(`[task-executor] ${taskId} history 생성 실패:`, err);
  });

  if (status === "WARNING") {
    setImmediate(() => {
      void evaluateAndMaybeAutoFix(taskId).catch((err) => {
        console.error(`[task-executor] ${taskId} Auto Fix 평가 중 오류:`, err);
      });
    });
  }
}

const agentLabel: Record<string, LogSource> = { claude: "claude", codex: "codex" };

function implementationReportBefore(steps: WorkflowStep[], currentStepId: string): string | null {
  const reports = steps
    .slice(
      0,
      steps.findIndex((step) => step.id === currentStepId),
    )
    .filter((step) => step.action !== "review" && step.result?.summary?.trim())
    .map(
      (step) =>
        `[${agentLabelKo(step.agent)} ${actionLabelKo(step.action)} / ${step.status}]\n${step.result!.summary!.trim()}`,
    );
  return reports.length > 0 ? reports.join("\n\n").slice(-12_000) : null;
}

/**
 * Runs every Step in the Task's workflow, in order:
 *   git prepare -> Step 1 -> Step 2 -> ... -> READY/WARNING/FAILED/CANCELLED.
 * A `review`-action Step is skipped (SKIPPED, skipReason=NO_CHANGES) when
 * there is no git diff to review. An `implement`/`analyze` Step failing
 * stops the workflow (task FAILED); a `review` Step's own execution failing
 * degrades the task to WARNING without discarding earlier Steps' results.
 *
 * Fire-and-forget from the caller's perspective; all progress goes through
 * the task store + event bus.
 */
export async function executeTask(taskId: string, projectPathKey: string): Promise<void> {
  const task = taskStore.get(taskId);
  if (!task) return;

  const run: ActiveRun = { projectPathKey, cancel: () => {}, cancelled: false };
  activeRuns.set(taskId, run);

  const startedAt = new Date().toISOString();
  commitTaskStatus(taskId, "RUNNING", { startedAt });
  emitLog(taskId, makeLog("system", "info", "작업을 시작합니다."));

  try {
    // ---- Git preparation ----
    try {
      const prepared = await prepareGitState(task.projectPath, task.baseBranch, task.branch);
      taskStore.update(taskId, { gitInfo: prepared.info });
      for (const line of prepared.logLines) emitLog(taskId, makeLog("system", "info", line));
    } catch (err) {
      const message = err instanceof GitError ? err.message : String(err);
      emitLog(taskId, makeLog("system", "stderr", `Git 준비 실패: ${message}`));
      await finalizeTerminal(taskId, "FAILED", { error: message });
      return;
    }

    if (run.cancelled) {
      await finalizeTerminal(taskId, "CANCELLED");
      emitLog(taskId, makeLog("system", "info", "작업이 취소되었습니다."));
      return;
    }

    // ---- Steps, in order ----
    let sawWarning = false;
    let index = 0;

    for (;;) {
      const current = taskStore.get(taskId);
      if (!current) return;
      const steps = current.workflow.steps;
      if (index >= steps.length) break;
      const step = steps[index]!;
      index++;

      if (run.cancelled) {
        commitStep(taskId, step.id, { status: "CANCELLED" }, "CANCELLED");
        emitLog(taskId, makeLog("system", "info", "작업이 취소되었습니다."));
        return;
      }

      // Review steps only make sense when there's something to review.
      if (step.action === "review") {
        const changedFiles = await getChangedFiles(task.projectPath);
        if (changedFiles.length === 0) {
          commitStep(
            taskId,
            step.id,
            {
              status: "SKIPPED",
              skipReason: "NO_CHANGES",
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
            "RUNNING",
          );
          emitLog(
            taskId,
            makeLog(
              "system",
              "info",
              `${agentLabelKo(step.agent)} 리뷰 Step 건너뜀 (변경사항 없음).`,
            ),
          );
          continue;
        }
      }

      const stepStartedAt = new Date().toISOString();
      const taskStatusWhileRunning: TaskStatus = step.action === "review" ? "REVIEWING" : "RUNNING";
      commitStep(
        taskId,
        step.id,
        { status: "RUNNING", startedAt: stepStartedAt },
        taskStatusWhileRunning,
      );
      emitLog(
        taskId,
        makeLog(
          "system",
          "info",
          `${agentLabelKo(step.agent)} ${actionLabelKo(step.action)} 시작.`,
        ),
      );

      const { handle, result } = runWorkflowStep(
        step,
        task.instruction,
        task.title,
        task.projectPath,
        taskStore.getTaskDir(taskId),
        (line) =>
          emitLog(taskId, makeLog(agentLabel[step.agent] ?? "system", line.stream, line.text)),
        current.acceptanceCriteria,
        step.action === "review" ? implementationReportBefore(steps, step.id) : null,
      );
      run.cancel = handle.cancel;

      const outcome = await result;
      const stepCompletedAt = new Date().toISOString();

      if (outcome.cancelled || run.cancelled) {
        commitStep(
          taskId,
          step.id,
          {
            status: "CANCELLED",
            completedAt: stepCompletedAt,
            result: {
              exitCode: outcome.exitCode,
              success: false,
              summary: outcome.summary,
              review: null,
            },
          },
          "CANCELLED",
        );
        emitLog(taskId, makeLog("system", "info", "작업이 취소되었습니다."));
        return;
      }

      const stepResult = {
        exitCode: outcome.exitCode,
        success: outcome.success,
        summary: outcome.summary,
        review: outcome.review,
      };

      if (!outcome.success) {
        if (step.action === "review") {
          // The reviewer itself failed to run — don't discard earlier Steps'
          // work. The runner logs the execution failure details.
          const reviewFailureMessage = outcome.review
            ? "리뷰 결과 파싱에 실패했습니다."
            : "리뷰 실행에 실패했습니다.";
          commitStep(
            taskId,
            step.id,
            {
              status: "FAILED",
              completedAt: stepCompletedAt,
              result: stepResult,
              error: reviewFailureMessage,
            },
            "REVIEWING",
          );
          sawWarning = true;
          emitLog(
            taskId,
            makeLog("system", "stderr", `${reviewFailureMessage} 이전 Step 결과는 유지됩니다.`),
          );
          continue;
        }
        const message = `${agentLabelKo(step.agent)} ${actionLabelKo(step.action)}이(가) 비정상 종료했습니다 (exitCode=${String(outcome.exitCode)}).`;
        commitStep(
          taskId,
          step.id,
          { status: "FAILED", completedAt: stepCompletedAt, result: stepResult, error: message },
          "FAILED",
          { error: message },
        );
        emitLog(taskId, makeLog("system", "stderr", message));
        await finalizeTerminal(taskId, "FAILED", { error: message });
        return;
      }

      commitStep(
        taskId,
        step.id,
        { status: "SUCCESS", completedAt: stepCompletedAt, result: stepResult },
        taskStatusWhileRunning,
      );
      emitLog(
        taskId,
        makeLog(
          "system",
          "info",
          `${agentLabelKo(step.agent)} ${actionLabelKo(step.action)} 완료.` +
            (outcome.review
              ? ` 결과: ${outcome.review.result}${outcome.review.issues.length ? ` (${outcome.review.issues.length}건)` : ""}`
              : ""),
        ),
      );

      if (outcome.review?.result === "WARNING") sawWarning = true;

      // Backfill Task.acceptanceCriteria once, from whatever the first
      // review derived — later review runs (fix/re-review) then grade
      // against this same fixed set instead of each inventing its own.
      if (
        step.action === "review" &&
        outcome.review?.raw &&
        (!current.acceptanceCriteria || current.acceptanceCriteria.length === 0)
      ) {
        const defs = parseAcceptanceCriteriaDefinitions(outcome.review.raw);
        if (defs) taskStore.update(taskId, { acceptanceCriteria: defs });
      }
    }

    await finalizeTerminal(taskId, sawWarning ? "WARNING" : "READY");
  } finally {
    activeRuns.delete(taskId);
    taskEventBus.publish(taskId, { type: "end" });
  }
}

function agentLabelKo(agent: string): string {
  return agent === "claude" ? "Claude" : agent === "codex" ? "Codex" : agent;
}

function actionLabelKo(action: string): string {
  switch (action) {
    case "implement":
      return "구현";
    case "analyze":
      return "분석";
    case "review":
      return "리뷰";
    default:
      return action;
  }
}

export function cancelActiveRun(taskId: string): boolean {
  const run = activeRuns.get(taskId);
  if (!run) return false;
  run.cancelled = true;
  run.cancel();
  return true;
}

export function isProjectPathBusy(projectPathKey: string): boolean {
  for (const run of activeRuns.values()) {
    if (run.projectPathKey === projectPathKey) return true;
  }
  return false;
}
