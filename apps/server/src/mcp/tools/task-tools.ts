import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { TaskStatus } from "@ai-task-router/shared";
import { taskService, TaskServiceError } from "../../tasks/task-service";
import { taskSpecShape, type TaskSpec } from "../../tasks/task-input";
import {
  DEFAULT_MAX_DIFF_CHARS,
  changedFilesToStatusText,
  dashboardTaskUrl,
  toTaskDetail,
  toTaskListSummary,
  truncateDiff,
} from "./format";

/**
 * MCP tools are a thin adapter: every tool below just validates input and
 * calls the existing TaskService (the same one HTTP routes call). No task
 * execution logic — git/Claude/Codex handling — lives here or gets
 * duplicated here. `taskSpecShape` is imported rather than redefined so the
 * REST route and the MCP tools validate "create a task" input identically.
 *
 * Every `taskId` parameter below accepts either the internal UUID or the
 * short Job ID (e.g. "T-1042") — taskService resolves both the same way.
 */

const TASK_ID_DESCRIPTION = "Task의 UUID 또는 Job ID (예: T-1042)";

function textResult(payload: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Task 생성 + 즉시 시작. Claude/Codex 완료를 기다리지 않고 바로 반환한다. */
async function createAndStartTask(spec: TaskSpec) {
  const task = taskService.createTask({
    title: spec.title,
    projectPath: spec.projectPath,
    instruction: spec.instruction,
    baseBranch: spec.baseBranch ?? null,
    branch: spec.branch ?? null,
    workflow: spec.workflow ?? null,
  });

  try {
    // startTask kicks off TaskExecutor asynchronously (fire-and-forget under
    // the hood) and resolves as soon as the RUNNING transition is recorded —
    // it does not wait for any Step to finish.
    const started = await taskService.startTask(task.id);
    return {
      taskId: started.id,
      jobId: started.jobId,
      status: started.status,
      dashboardUrl: dashboardTaskUrl(started),
    };
  } catch (err) {
    // Task exists but couldn't be started (e.g. same-project already busy).
    // Surface that as a warning rather than losing the created task.
    return {
      taskId: task.id,
      jobId: task.jobId,
      status: task.status,
      dashboardUrl: dashboardTaskUrl(task),
      warning: err instanceof TaskServiceError ? err.message : messageOf(err),
    };
  }
}

export function registerTaskTools(server: McpServer): void {
  server.registerTool(
    "run_task",
    {
      title: "Run Task",
      description:
        "새 Task를 생성하고 즉시 실행한다. Claude/Codex 작업 완료를 기다리지 않고 taskId/jobId를 바로 반환한다. title을 생략하면 instruction으로부터 자동 생성된다. workflow를 생략하면 이 프로젝트의 마지막 Workflow, 그마저 없으면 Settings의 기본 Workflow를 사용한다.",
      inputSchema: taskSpecShape,
    },
    async (args) => {
      try {
        return textResult(await createAndStartTask(args));
      } catch (err) {
        return errorResult(messageOf(err));
      }
    },
  );

  server.registerTool(
    "run_tasks",
    {
      title: "Run Tasks",
      description:
        "여러 Task를 한 번에 생성하고 즉시 실행한다. 서로 다른 프로젝트는 병렬로 실행된다. 각 Task 완료를 기다리지 않고 taskId/jobId 목록을 즉시 반환한다.",
      inputSchema: {
        tasks: z.array(z.object(taskSpecShape)).min(1).describe("실행할 Task 목록"),
      },
    },
    async ({ tasks }) => {
      const results = [];
      for (const spec of tasks) {
        try {
          results.push(await createAndStartTask(spec));
        } catch (err) {
          results.push({ title: spec.title, error: messageOf(err) });
        }
      }
      return textResult({ tasks: results });
    },
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description: "현재 Task 목록을 조회한다. status로 필터링할 수 있다.",
      inputSchema: {
        status: z
          .enum(["QUEUED", "RUNNING", "REVIEWING", "READY", "WARNING", "FAILED", "CANCELLED"])
          .optional()
          .describe("이 상태의 Task만 반환 (선택)"),
      },
    },
    ({ status }) => {
      const all = taskService.listTasks();
      const filtered = status ? all.filter((t) => t.status === (status as TaskStatus)) : all;
      return textResult({ tasks: filtered.map(toTaskListSummary) });
    },
  );

  server.registerTool(
    "get_task",
    {
      title: "Get Task",
      description:
        "특정 Task의 현재 상태, Workflow Step별 결과, 변경 파일을 조회한다. 전체 실시간 로그는 포함하지 않는다.",
      inputSchema: { taskId: z.string().min(1).describe(TASK_ID_DESCRIPTION) },
    },
    async ({ taskId }) => {
      const task = taskService.getTask(taskId);
      if (!task) return errorResult(`Task를 찾을 수 없습니다: ${taskId}`);
      try {
        const { changedFiles } = await taskService.getTaskDiff(task.id);
        return textResult(toTaskDetail(task, changedFiles));
      } catch (err) {
        // Project path may be gone/inaccessible — still return task status.
        return textResult({ ...toTaskDetail(task, []), diffError: messageOf(err) });
      }
    },
  );

  server.registerTool(
    "get_task_result",
    {
      title: "Get Task Result",
      description:
        "완료된 Task의 최종 검토용 정보(원 지시사항, 최종 상태, Workflow Step별 결과, git status, 변경 파일, git diff)를 반환한다. diff가 큰 경우 잘라서 반환하며 그 사실을 diffTruncated로 표시한다.",
      inputSchema: {
        taskId: z.string().min(1).describe(TASK_ID_DESCRIPTION),
        maxDiffChars: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`diff 최대 길이 (기본 ${DEFAULT_MAX_DIFF_CHARS}자)`),
      },
    },
    async ({ taskId, maxDiffChars }) => {
      const task = taskService.getTask(taskId);
      if (!task) return errorResult(`Task를 찾을 수 없습니다: ${taskId}`);

      let changedFiles: Awaited<ReturnType<typeof taskService.getTaskDiff>>["changedFiles"] = [];
      let diffInfo = { diff: "", truncated: false, originalLength: 0 };
      let diffError: string | null = null;
      try {
        const result = await taskService.getTaskDiff(task.id);
        changedFiles = result.changedFiles;
        diffInfo = truncateDiff(result.diff, maxDiffChars ?? DEFAULT_MAX_DIFF_CHARS);
      } catch (err) {
        diffError = messageOf(err);
      }

      return textResult({
        taskId: task.id,
        jobId: task.jobId,
        title: task.title,
        projectPath: task.projectPath,
        branch: task.branch,
        instruction: task.instruction,
        finalStatus: task.status,
        error: task.error,
        workflow: task.workflow,
        gitStatus: diffError ? null : changedFilesToStatusText(changedFiles),
        changedFiles,
        diff: diffError ? null : diffInfo.diff,
        diffTruncated: diffInfo.truncated,
        diffOriginalLength: diffInfo.truncated ? diffInfo.originalLength : undefined,
        diffError,
        dashboardUrl: dashboardTaskUrl(task),
      });
    },
  );

  server.registerTool(
    "cancel_task",
    {
      title: "Cancel Task",
      description:
        "대기 중(QUEUED)이거나 실행 중(RUNNING/REVIEWING)인 Task를 취소한다. QUEUED는 즉시 CANCELLED로 전이되고, RUNNING/REVIEWING은 해당 Task의 프로세스만 종료된다(다른 Task에는 영향 없음).",
      inputSchema: { taskId: z.string().min(1).describe(TASK_ID_DESCRIPTION) },
    },
    (args) => {
      try {
        const task = taskService.cancelTask(args.taskId);
        return textResult({ taskId: task.id, jobId: task.jobId, status: task.status });
      } catch (err) {
        return errorResult(messageOf(err));
      }
    },
  );
}
