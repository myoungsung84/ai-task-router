import { v4 as uuid } from "uuid";
import type { CreateTaskInput, Task, TaskDiff, TaskListItem } from "@ai-task-router/shared";
import { taskStore } from "./task-store";
import { activeRuns, cancelActiveRun, executeTask, isProjectPathBusy } from "./task-executor";
import { validateProjectPath, normalizeForCompare } from "../projects/project-validator";
import { getChangedFiles, getDiff, isGitRepository } from "../git/git-manager";

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

/**
 * Business logic layer. Deliberately framework-agnostic (no req/res here) so
 * a future MCP server can call these functions directly, same as the HTTP
 * controllers do.
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

    const now = new Date().toISOString();
    const task: Task = {
      id: uuid(),
      title,
      projectPath: validation.normalizedPath,
      instruction,
      baseBranch: input.baseBranch?.trim() || null,
      branch: input.branch?.trim() || null,
      status: "QUEUED",
      claudeStatus: "PENDING",
      codexStatus: "PENDING",
      createdAt: now,
      startedAt: null,
      completedAt: null,
      claudeResult: null,
      codexReviewResult: null,
      logs: [],
      error: null,
      gitInfo: null,
    };

    taskStore.create(task);
    return task;
  },

  async startTask(id: string): Promise<Task> {
    const task = taskStore.get(id);
    if (!task) throw new TaskServiceError("Task를 찾을 수 없습니다.", 404);
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

    // Reset any leftover state from a previous FAILED/CANCELLED attempt.
    taskStore.update(id, {
      status: "QUEUED",
      claudeStatus: "PENDING",
      codexStatus: "PENDING",
      error: null,
      completedAt: null,
    });

    // Fire-and-forget: the executor reports progress via the event bus / store.
    void executeTask(id, projectKey).catch((err) => {
      console.error(`[task-service] Task ${id} 실행 중 예기치 못한 오류:`, err);
      taskStore.update(id, {
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date().toISOString(),
      });
    });

    return taskStore.get(id)!;
  },

  cancelTask(id: string): Task {
    const task = taskStore.get(id);
    if (!task) throw new TaskServiceError("Task를 찾을 수 없습니다.", 404);
    if (task.status !== "RUNNING" && task.status !== "REVIEWING") {
      throw new TaskServiceError(`현재 상태(${task.status})는 취소할 수 없습니다.`, 409);
    }
    const cancelled = cancelActiveRun(id);
    if (!cancelled) {
      throw new TaskServiceError("실행 중인 프로세스를 찾지 못했습니다.", 409);
    }
    return taskStore.get(id)!;
  },

  getTask(id: string): Task | undefined {
    return taskStore.get(id);
  },

  listTasks(): TaskListItem[] {
    return taskStore.list().map(stripLogs);
  },

  getTaskResult(id: string) {
    const task = taskStore.get(id);
    if (!task) throw new TaskServiceError("Task를 찾을 수 없습니다.", 404);
    return {
      status: task.status,
      claudeResult: task.claudeResult,
      codexReviewResult: task.codexReviewResult,
      error: task.error,
    };
  },

  async getTaskDiff(id: string): Promise<TaskDiff> {
    const task = taskStore.get(id);
    if (!task) throw new TaskServiceError("Task를 찾을 수 없습니다.", 404);
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
