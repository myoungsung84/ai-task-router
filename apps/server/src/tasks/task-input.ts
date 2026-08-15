import { z } from "zod";
import { workflowSpecSchema } from "./workflow-spec-schema";

/**
 * Single source of truth for "create a task" input shape, shared by the
 * REST route (`task-routes.ts`) and the MCP tools (`mcp/tools/task-tools.ts`)
 * so the two entry points can't drift and neither has to hand an untyped
 * `any` request body straight to `taskService.createTask`.
 */
export const taskSpecShape = {
  // Optional: taskService.createTask() generates one from `instruction` via
  // generateTitleFromInstruction() when this is absent/empty, so the server
  // always guarantees a final title. Existing callers that already send a
  // title keep working unchanged.
  title: z.string().optional().describe("Task 제목 (생략하면 작업 지시사항으로부터 자동 생성)"),
  projectPath: z
    .string()
    .min(1)
    .describe("로컬 Git 저장소 경로 (예: D:\\\\01.src\\\\company\\\\backend)"),
  instruction: z.string().min(1).describe("Claude CLI에게 전달할 작업 지시사항"),
  // .nullable() as well as .optional(): the dashboard form posts `null` (not
  // just an absent field) for an empty branch input, matching
  // CreateTaskInput's `string | null | undefined` in packages/shared.
  baseBranch: z
    .string()
    .nullable()
    .optional()
    .describe("branch가 새로 생성될 때만 사용되는 기준 브랜치 (선택)"),
  branch: z
    .string()
    .nullable()
    .optional()
    .describe("작업할 브랜치. 없으면 현재 브랜치에서 작업 (선택)"),
  workflow: workflowSpecSchema
    .nullable()
    .optional()
    .describe("생략하면 이 프로젝트의 마지막 Workflow, 그마저 없으면 Settings 기본값을 사용한다."),
  parentTaskId: z
    .string()
    .nullable()
    .optional()
    .describe(
      "이 Task가 다른 Task의 WARNING 후속 조치로 생성된 경우, 원본 Task의 id/Job ID (선택)",
    ),
  linkKind: z
    .enum(["fix_and_rereview", "review_only", "rerun"])
    .nullable()
    .optional()
    .describe("parentTaskId가 있을 때 후속 조치 종류 (선택)"),
};

export const taskSpecSchema = z.object(taskSpecShape);
export type TaskSpec = z.infer<typeof taskSpecSchema>;
