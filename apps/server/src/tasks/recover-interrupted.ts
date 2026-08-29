import type { Task, WorkflowStep } from "@ai-task-router/shared";
import { taskStore } from "./task-store";

/**
 * Reconciles Tasks that were mid-run when the server last stopped.
 *
 * Agent runs are child processes owned by this process, and the handles that
 * let a run be cancelled live only in memory. So when the server exits — a
 * crash, a `tsx watch` reload after a dependency rebuild, a machine restart —
 * every child dies with it while the stored Task still says RUNNING or
 * REVIEWING.
 *
 * Nothing used to notice. The Task stayed in that state forever, and both ways
 * out were closed against it: `cancelTask` refuses with "실행 중인 프로세스를
 * 찾지 못했습니다" because there is no process left to signal, and `deleteTask`
 * refuses to remove a Task that claims to be running. The record became
 * permanently unactionable, and the dashboard kept reporting work that had
 * stopped happening.
 *
 * Marking them FAILED at boot is the honest reading: the run did not finish,
 * and nobody chose to stop it. FAILED (rather than CANCELLED) also puts them in
 * 확인 필요, where an interrupted run is visible and can be re-run, instead of
 * filed away as something the user decided against.
 */

const INTERRUPTED_STATUSES = new Set<Task["status"]>(["RUNNING", "REVIEWING"]);
const INTERRUPTED_STEP_STATUSES = new Set<WorkflowStep["status"]>(["RUNNING"]);

const TASK_ERROR = "서버가 재시작되어 실행이 중단되었습니다. 다시 실행해 주세요.";
const STEP_ERROR = "서버 재시작으로 중단됨";

export interface RecoveryResult {
  recovered: string[];
}

export function recoverInterruptedTasks(now = new Date()): RecoveryResult {
  const completedAt = now.toISOString();
  const recovered: string[] = [];

  for (const task of taskStore.list()) {
    if (!INTERRUPTED_STATUSES.has(task.status)) continue;

    // A PENDING Step is left alone: it never started, so "중단됨" would be a
    // false claim about work that was only ever queued behind the one that did.
    const steps = (task.workflow?.steps ?? []).map((step) =>
      INTERRUPTED_STEP_STATUSES.has(step.status)
        ? { ...step, status: "FAILED" as const, completedAt, error: STEP_ERROR }
        : step,
    );

    taskStore.update(task.id, {
      status: "FAILED",
      completedAt,
      error: task.error ?? TASK_ERROR,
      workflow: { ...task.workflow, steps },
    });
    recovered.push(task.jobId);
  }

  return { recovered };
}
