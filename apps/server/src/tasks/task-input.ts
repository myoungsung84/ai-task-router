import { z } from "zod";

/**
 * Single source of truth for "create a task" input shape, shared by the
 * REST route (`task-routes.ts`) and the MCP tools (`mcp/tools/task-tools.ts`)
 * so the two entry points can't drift and neither has to hand an untyped
 * `any` request body straight to `taskService.createTask`.
 */
export const taskSpecShape = {
  title: z.string().min(1).describe("Task 제목"),
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
};

export const taskSpecSchema = z.object(taskSpecShape);
export type TaskSpec = z.infer<typeof taskSpecSchema>;
