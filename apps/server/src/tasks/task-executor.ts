import { v4 as uuid } from "uuid";
import type {
  LogEntry,
  LogSource,
  LogStream,
  RunnerStatus,
  Task,
  TaskStatus,
} from "@ai-task-router/shared";
import { taskStore } from "./task-store";
import { taskEventBus } from "../stream/event-bus";
import { prepareGitState, GitError } from "../git/git-manager";
import { runClaude } from "../runners/claude/claude-runner";
import { runCodexReview } from "../runners/codex/codex-runner";
import { notifier } from "../notifications/notifier";

interface ActiveRun {
  projectPathKey: string;
  cancel: () => void;
  cancelled: boolean;
}

/** taskId -> currently running process handles, used by cancel + the same-project guard. */
export const activeRuns = new Map<string, ActiveRun>();

function makeLog(source: LogSource, stream: LogStream, text: string): LogEntry {
  return { id: uuid(), source, stream, text, timestamp: new Date().toISOString() };
}

function emitLog(taskId: string, entry: LogEntry): void {
  taskStore.appendLog(taskId, entry);
  taskEventBus.publish(taskId, { type: "log", log: entry });
}

function emitStatus(
  taskId: string,
  status: TaskStatus,
  claudeStatus: RunnerStatus,
  codexStatus: RunnerStatus,
  extra: Partial<Task> = {},
): Task | undefined {
  const updated = taskStore.update(taskId, { status, claudeStatus, codexStatus, ...extra });
  taskEventBus.publish(taskId, { type: "status", status, claudeStatus, codexStatus });
  return updated;
}

function notifyTerminal(task: Task): void {
  if (task.status !== "READY" && task.status !== "WARNING" && task.status !== "FAILED") {
    return;
  }
  const labels: Record<string, string> = {
    READY: "✅ READY",
    WARNING: "⚠ WARNING",
    FAILED: "❌ FAILED",
  };
  notifier.notify({
    title: `[ai-task-router] ${labels[task.status]}`,
    message: `${task.title} (${task.projectPath})`,
  });
}

/**
 * Runs the full Task pipeline for an already-QUEUED task:
 * git prepare -> Claude -> (on success) Codex review once -> READY/WARNING.
 * Fire-and-forget from the caller's perspective; all progress goes through
 * the task store + event bus.
 */
export async function executeTask(taskId: string, projectPathKey: string): Promise<void> {
  const task = taskStore.get(taskId);
  if (!task) return;

  const run: ActiveRun = { projectPathKey, cancel: () => {}, cancelled: false };
  activeRuns.set(taskId, run);

  const startedAt = new Date().toISOString();
  emitStatus(taskId, "RUNNING", "PENDING", "PENDING", { startedAt });
  emitLog(taskId, makeLog("system", "info", "작업을 시작합니다."));

  try {
    // ---- Git preparation ----
    let gitInfo;
    try {
      const prepared = await prepareGitState(task.projectPath, task.baseBranch, task.branch);
      gitInfo = prepared.info;
      for (const line of prepared.logLines) {
        emitLog(taskId, makeLog("system", "info", line));
      }
    } catch (err) {
      const message = err instanceof GitError ? err.message : String(err);
      emitLog(taskId, makeLog("system", "stderr", `Git 준비 실패: ${message}`));
      const failed = emitStatus(taskId, "FAILED", "PENDING", "SKIPPED", {
        error: message,
        completedAt: new Date().toISOString(),
      });
      if (failed) notifyTerminal(failed);
      return;
    }

    taskStore.update(taskId, { gitInfo });

    if (run.cancelled) {
      finalizeCancelled(taskId, "PENDING", "SKIPPED");
      return;
    }

    // ---- Claude ----
    emitLog(taskId, makeLog("system", "info", "Claude CLI를 실행합니다."));
    emitStatus(taskId, "RUNNING", "RUNNING", "PENDING");

    const claudeStartedAt = new Date().toISOString();
    const { handle: claudeHandle, result: claudeResultPromise } = runClaude(
      task.instruction,
      task.projectPath,
      (line) => emitLog(taskId, makeLog("claude", line.stream, line.text)),
    );
    run.cancel = claudeHandle.cancel;

    const claudeOutcome = await claudeResultPromise;

    if (claudeOutcome.cancelled || run.cancelled) {
      taskStore.update(taskId, {
        claudeResult: {
          exitCode: claudeOutcome.exitCode,
          success: false,
          summary: claudeOutcome.summary || null,
          startedAt: claudeStartedAt,
          completedAt: new Date().toISOString(),
        },
      });
      finalizeCancelled(taskId, "CANCELLED", "SKIPPED");
      return;
    }

    taskStore.update(taskId, {
      claudeResult: {
        exitCode: claudeOutcome.exitCode,
        success: claudeOutcome.success,
        summary: claudeOutcome.summary || null,
        startedAt: claudeStartedAt,
        completedAt: new Date().toISOString(),
      },
    });

    if (!claudeOutcome.success) {
      emitLog(
        taskId,
        makeLog(
          "system",
          "stderr",
          `Claude가 비정상 종료했습니다 (exitCode=${claudeOutcome.exitCode}).`,
        ),
      );
      const failed = emitStatus(taskId, "FAILED", "FAILED", "SKIPPED", {
        error: `Claude CLI가 비정상 종료했습니다 (exitCode=${claudeOutcome.exitCode}).`,
        completedAt: new Date().toISOString(),
      });
      if (failed) notifyTerminal(failed);
      return;
    }

    emitLog(
      taskId,
      makeLog("system", "info", "Claude 실행이 완료되었습니다. Codex 리뷰를 시작합니다."),
    );
    emitStatus(taskId, "REVIEWING", "SUCCESS", "RUNNING");

    // ---- Codex review (exactly once) ----
    const { handle: codexHandle, result: codexResultPromise } = runCodexReview(
      taskId,
      task.title,
      task.instruction,
      task.projectPath,
      taskStore.getTaskDir(taskId),
      (line) => emitLog(taskId, makeLog("codex", line.stream, line.text)),
    );
    run.cancel = codexHandle.cancel;

    const codexOutcome = await codexResultPromise;

    if (codexOutcome.cancelled || run.cancelled) {
      taskStore.update(taskId, { codexReviewResult: codexOutcome.review });
      finalizeCancelled(taskId, "SUCCESS", "CANCELLED");
      return;
    }

    taskStore.update(taskId, { codexReviewResult: codexOutcome.review });
    emitLog(
      taskId,
      makeLog(
        "system",
        "info",
        `Codex 리뷰 완료: ${codexOutcome.review.result}${
          codexOutcome.review.issues.length ? ` (${codexOutcome.review.issues.length}건)` : ""
        }`,
      ),
    );

    const finalStatus: TaskStatus = codexOutcome.review.result === "PASS" ? "READY" : "WARNING";
    const finished = emitStatus(
      taskId,
      finalStatus,
      "SUCCESS",
      codexOutcome.executionOk ? "SUCCESS" : "FAILED",
      { completedAt: new Date().toISOString() },
    );
    if (finished) notifyTerminal(finished);
  } finally {
    activeRuns.delete(taskId);
    taskEventBus.publish(taskId, { type: "end" });
  }
}

function finalizeCancelled(
  taskId: string,
  claudeStatus: RunnerStatus,
  codexStatus: RunnerStatus,
): void {
  emitLog(taskId, makeLog("system", "info", "작업이 취소되었습니다."));
  emitStatus(taskId, "CANCELLED", claudeStatus, codexStatus, {
    completedAt: new Date().toISOString(),
  });
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
