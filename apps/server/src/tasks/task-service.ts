import { v4 as uuid } from "uuid";
import type {
  CreateTaskInput,
  Task,
  TaskDiff,
  TaskListItem,
  WorkflowSpec,
} from "@ai-task-router/shared";
import { taskStore } from "./task-store";
import { activeRuns, cancelActiveRun, executeTask, isProjectPathBusy } from "./task-executor";
import { validateProjectPath, normalizeForCompare } from "../projects/project-validator";
import { getChangedFiles, getDiff, isGitRepository } from "../git/git-manager";
import { allocateJobId } from "./job-id";
import { buildWorkflowFromSpec } from "./workflow-builder";
import { settingsService } from "../settings/settings-service";

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

/**
 * Business logic layer. Deliberately framework-agnostic (no req/res here) so
 * both the REST routes and the MCP tools call the exact same functions.
 * Every lookup accepts either the internal UUID or the human-friendly Job ID
 * (e.g. "T-1042") via TaskStore.resolve() — one resolver, no duplication.
 */
export const taskService = {
  createTask(input: CreateTaskInput): Task {
    const title = input.title?.trim();
    const instruction = input.instruction?.trim();
    if (!title) throw new TaskServiceError("title은 필수입니다.");
    if (!instruction) throw new TaskServiceError("instruction은 필수입니다.");

    const validation = validateProjectPath(input.projectPath ?? "");
    if (!validation.ok || !validation.normalizedPath) {
      throw new TaskServiceError(validation.error ?? "projectPath가 올바르지 않습니다.");
    }

    const spec: WorkflowSpec = input.workflow ?? settingsService.get().defaultWorkflow;
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
    };

    taskStore.create(task);
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

  cancelTask(identifier: string): Task {
    const task = requireTask(identifier);
    if (task.status !== "RUNNING" && task.status !== "REVIEWING") {
      throw new TaskServiceError(`현재 상태(${task.status})는 취소할 수 없습니다.`, 409);
    }
    const cancelled = cancelActiveRun(task.id);
    if (!cancelled) {
      throw new TaskServiceError("실행 중인 프로세스를 찾지 못했습니다.", 409);
    }
    return taskStore.get(task.id)!;
  },

  /** Deletes a completed Task's stored JSON + logs. RUNNING/REVIEWING tasks cannot be deleted (cancel first). Markdown history is left untouched — it's the permanent record. */
  deleteTask(identifier: string): void {
    const task = requireTask(identifier);
    if (task.status === "RUNNING" || task.status === "REVIEWING") {
      throw new TaskServiceError("실행 중인 Task는 삭제할 수 없습니다. 먼저 중단하세요.", 409);
    }
    taskStore.delete(task.id);
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
