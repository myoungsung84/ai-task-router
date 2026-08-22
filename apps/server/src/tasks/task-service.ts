import { v4 as uuid } from "uuid";
import type {
  CreateTaskInput,
  LogEntry,
  Task,
  TaskDiff,
  TaskListItem,
  WorkflowSpec,
} from "@ai-task-router/shared";
import {
  generateTitleFromInstruction,
  resolveWorkflowSpecForPurpose,
} from "@ai-task-router/shared";
import { taskStore } from "./task-store";
import { activeRuns, cancelActiveRun, executeTask, isProjectPathBusy } from "./task-executor";
import { validateProjectPath, normalizeForCompare } from "../projects/project-validator";
import { getChangedFiles, getDiff, isGitRepository } from "../git/git-manager";
import { recordProjectUsage } from "../projects/project-memory-store";
import { allocateJobId } from "./job-id";
import { buildWorkflowFromSpec } from "./workflow-builder";
import { settingsService } from "../settings/settings-service";
import { taskEventBus } from "../stream/event-bus";
import { parseReviewJson } from "../runners/review-prompt";

export class TaskServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function stripLogs(task: Task): TaskListItem {
  const { logs: _logs, ...rest } = task;
  return rest;
}

function requireTask(identifier: string): Task {
  const task = taskStore.resolve(identifier);
  if (!task) throw new TaskServiceError(`Task를 찾을 수 없습니다: ${identifier}`, 404);
  return task;
}

/** Appends a system-source log line and publishes it over SSE — the same shape task-executor.ts's own emitLog produces, for actions (cancel-while-QUEUED, resolve-warning) that happen outside the executor. */
function emitSystemLog(taskId: string, text: string): void {
  const log: LogEntry = {
    id: uuid(),
    source: "system",
    stream: "info",
    text,
    timestamp: new Date().toISOString(),
  };
  taskStore.appendLog(taskId, log);
  taskEventBus.publish(taskId, { type: "log", log });
}

/**
 * Business logic layer. Deliberately framework-agnostic (no req/res here) so
 * both the REST routes and the MCP tools call the exact same functions.
 * Every lookup accepts either the internal UUID or the human-friendly Job ID
 * (e.g. "T-1042") via TaskStore.resolve() — one resolver, no duplication.
 */
export const taskService = {
  createTask(input: CreateTaskInput): Task {
    const instruction = input.instruction?.trim();
    if (!instruction) throw new TaskServiceError("instruction은 필수입니다.");

    // title is optional end-to-end (REST body, MCP run_task/run_tasks) —
    // this is the one place that guarantees every stored Task has a
    // non-empty title, whether the caller sent one or not.
    const providedTitle = input.title?.trim();
    const title = providedTitle || generateTitleFromInstruction(instruction);

    const validation = validateProjectPath(input.projectPath ?? "");
    if (!validation.ok || !validation.normalizedPath) {
      throw new TaskServiceError(validation.error ?? "projectPath가 올바르지 않습니다.");
    }

    // Workflow source, in priority order:
    //   1. an explicit `workflow` — the legacy/advanced escape hatch (a
    //      WARNING follow-up re-running its parent's exact Steps also goes
    //      through here). Bypasses purpose/roleOverrides entirely.
    //   2. `purpose` + `roleOverrides`, resolved against Settings' Role
    //      config — the normal path for both the web UI and any MCP caller
    //      that specifies purpose.
    //   3. `purpose` defaulted to "implement" — only reached by an
    //      old/not-yet-updated MCP caller that sends neither `workflow` nor
    //      `purpose`; keeps such a caller working rather than rejecting it.
    // Deliberately NOT included: any per-project "last Workflow used" memory
    // — Workflow is always derived fresh from purpose + Settings/overrides.
    const spec: WorkflowSpec =
      input.workflow ??
      resolveWorkflowSpecForPurpose(
        input.purpose ?? "implement",
        settingsService.get().roles,
        input.roleOverrides,
      );
    if (!spec.steps || spec.steps.length === 0) {
      throw new TaskServiceError("workflow.steps는 최소 1개 이상이어야 합니다.");
    }

    const now = new Date().toISOString();
    const task: Task = {
      id: uuid(),
      jobId: allocateJobId(),
      title,
      projectPath: validation.normalizedPath,
      instruction,
      baseBranch: input.baseBranch?.trim() || null,
      branch: input.branch?.trim() || null,
      status: "QUEUED",
      workflow: buildWorkflowFromSpec(spec),
      createdAt: now,
      startedAt: null,
      completedAt: null,
      logs: [],
      error: null,
      gitInfo: null,
      parentTaskId: input.parentTaskId?.trim() || null,
      linkKind: input.linkKind ?? null,
      acceptanceCriteria: input.acceptanceCriteria ?? null,
      reviewLoopCount: input.reviewLoopCount ?? 0,
    };

    taskStore.create(task);
    recordProjectUsage(validation.normalizedPath);
    return task;
  },

  async startTask(identifier: string): Promise<Task> {
    const task = requireTask(identifier);
    if (task.status !== "QUEUED" && task.status !== "FAILED" && task.status !== "CANCELLED") {
      throw new TaskServiceError(`현재 상태(${task.status})에서는 다시 시작할 수 없습니다.`, 409);
    }

    const projectKey = normalizeForCompare(task.projectPath);
    if (isProjectPathBusy(projectKey)) {
      throw new TaskServiceError(
        "동일한 프로젝트 경로에서 이미 실행 중인 Task가 있습니다. 해당 작업이 끝난 뒤 다시 시도하세요.",
        409,
      );
    }

    if (!(await isGitRepository(task.projectPath))) {
      throw new TaskServiceError(`Git 저장소가 아닙니다: ${task.projectPath}`, 400);
    }

    // Reset any leftover state from a previous FAILED/CANCELLED attempt —
    // steps go back to PENDING so the workflow runs cleanly from Step 1.
    taskStore.update(task.id, {
      status: "QUEUED",
      error: null,
      completedAt: null,
      workflow: {
        steps: task.workflow.steps.map((s) => ({
          ...s,
          status: "PENDING",
          startedAt: null,
          completedAt: null,
          result: null,
          error: null,
          skipReason: null,
        })),
      },
    });

    // Fire-and-forget: the executor reports progress via the event bus / store.
    void executeTask(task.id, projectKey).catch((err) => {
      console.error(`[task-service] Task ${task.id} 실행 중 예기치 못한 오류:`, err);
      taskStore.update(task.id, {
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date().toISOString(),
      });
    });

    return taskStore.get(task.id)!;
  },

  /**
   * QUEUED has no active process yet — cancelling it is a pure state
   * transition straight to CANCELLED (nothing to kill). RUNNING/REVIEWING
   * go through the existing active-run kill path. Either way this is the
   * only way to move a not-yet-terminal Task out of the way before it can
   * be deleted (see deleteTask below).
   */
  cancelTask(identifier: string): Task {
    const task = requireTask(identifier);

    if (task.status === "QUEUED") {
      const updated = taskStore.update(task.id, {
        status: "CANCELLED",
        completedAt: new Date().toISOString(),
      });
      if (updated) {
        taskEventBus.publish(task.id, {
          type: "status",
          status: "CANCELLED",
          workflow: updated.workflow,
        });
        emitSystemLog(task.id, "대기 중이던 작업을 취소했습니다.");
      }
      return updated!;
    }

    if (task.status !== "RUNNING" && task.status !== "REVIEWING") {
      throw new TaskServiceError(`현재 상태(${task.status})는 취소할 수 없습니다.`, 409);
    }
    const cancelled = cancelActiveRun(task.id);
    if (!cancelled) {
      throw new TaskServiceError("실행 중인 프로세스를 찾지 못했습니다.", 409);
    }
    return taskStore.get(task.id)!;
  },

  /**
   * Deletes a Task's stored JSON + logs. QUEUED/RUNNING/REVIEWING tasks
   * cannot be deleted directly — QUEUED has to be cancelled first (see
   * cancelTask above) and RUNNING/REVIEWING has to be stopped first, so a
   * running process's data can never be removed out from under it. Markdown
   * history is left untouched — it's the permanent record.
   */
  deleteTask(identifier: string): void {
    const task = requireTask(identifier);
    if (task.status === "QUEUED" || task.status === "RUNNING" || task.status === "REVIEWING") {
      throw new TaskServiceError(
        "대기 중이거나 실행 중인 Task는 바로 삭제할 수 없습니다. 먼저 취소하세요.",
        409,
      );
    }
    taskStore.delete(task.id);
  },

  /**
   * "검토 후 완료 처리" — the user has read the review issues (any
   * severity — low/medium/high) and decided the result is acceptable as-is,
   * so force the WARNING Task straight to READY without creating a
   * follow-up Task. Review issues and every Step's result are left exactly
   * as they are; only `status` changes.
   *
   * This is deliberately NOT gated on issue severity (that was the old
   * "낮은 심각도 무시" behavior) — the user is always the final judge of a
   * genuine review outcome. What it *does* still refuse, unconditionally,
   * is completing over a review that never produced a trustworthy result in
   * the first place:
   *   - a non-review (implement/analyze) Step failed
   *   - a review Step's own process failed (status FAILED)
   *   - a review Step "succeeded" but its output didn't actually parse — the
   *     runners fall back to a synthetic single-issue WARNING in that case
   *     (see claude-runner.ts / codex-runner.ts), which looks like a normal
   *     review outcome unless re-checked; re-running parseReviewJson on the
   *     stored `raw` text is the same check the runners used, so it
   *     reliably tells a genuine parsed result apart from that fallback
   *     without matching on message text.
   *   - no review Step actually ran at all
   * The client approximates these same conditions to decide whether to show
   * the button, but this is the authoritative check — the wire endpoint
   * (`POST /:id/resolve-warning`) and response shape are unchanged from the
   * previous "낮은 심각도 무시" version, so existing callers keep working.
   */
  resolveWarning(identifier: string): Task {
    const task = requireTask(identifier);
    if (task.status !== "WARNING") {
      throw new TaskServiceError(
        `WARNING 상태에서만 사용할 수 있습니다 (현재: ${task.status}).`,
        409,
      );
    }

    const nonReviewSteps = task.workflow.steps.filter((s) => s.action !== "review");
    if (nonReviewSteps.some((s) => s.status === "FAILED")) {
      throw new TaskServiceError(
        "구현/분석 Step이 실패해 완료 처리할 수 없습니다. 후속 Task로 다시 시도하세요.",
        409,
      );
    }

    const reviewSteps = task.workflow.steps.filter((s) => s.action === "review");
    const ranReviewSteps = reviewSteps.filter(
      (s) => s.status === "SUCCESS" || s.status === "FAILED",
    );
    if (ranReviewSteps.length === 0) {
      throw new TaskServiceError(
        "정상적으로 실행된 리뷰 결과가 없어 완료 처리할 수 없습니다.",
        409,
      );
    }
    const hasUnusableReview = ranReviewSteps.some((s) => {
      if (s.status === "FAILED") return true;
      const raw = s.result?.review?.raw;
      return !raw || parseReviewJson(raw) === null;
    });
    if (hasUnusableReview) {
      throw new TaskServiceError(
        "리뷰 실행 자체가 실패했거나 결과를 구조화하지 못해 완료 처리할 수 없습니다. 후속 Task로 다시 시도하세요.",
        409,
      );
    }

    const updated = taskStore.update(task.id, { status: "READY" });
    if (updated) {
      taskEventBus.publish(task.id, {
        type: "status",
        status: "READY",
        workflow: updated.workflow,
      });
      const issues = ranReviewSteps.flatMap((s) => s.result?.review?.issues ?? []);
      emitSystemLog(
        task.id,
        issues.length > 0
          ? `사용자가 리뷰 이슈 ${issues.length}건을 확인하고 완료 처리했습니다.`
          : "사용자가 리뷰 결과를 확인하고 완료 처리했습니다.",
      );
    }
    return updated!;
  },

  getTask(identifier: string): Task | undefined {
    return taskStore.resolve(identifier);
  },

  listTasks(): TaskListItem[] {
    return taskStore.list().map(stripLogs);
  },

  getTaskResult(identifier: string) {
    const task = requireTask(identifier);
    return {
      status: task.status,
      workflow: task.workflow,
      error: task.error,
    };
  },

  async getTaskDiff(identifier: string): Promise<TaskDiff> {
    const task = requireTask(identifier);
    const [changedFiles, diff] = await Promise.all([
      getChangedFiles(task.projectPath),
      getDiff(task.projectPath),
    ]);
    return { changedFiles, diff };
  },

  isBusy(projectPathKey: string): boolean {
    return isProjectPathBusy(projectPathKey);
  },

  _debugActiveRunCount(): number {
    return activeRuns.size;
  },
};
