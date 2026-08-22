import { z } from "zod";
import { workflowSpecSchema } from "./workflow-spec-schema";

const roleOverrideSchema = z.object({
  agent: z.enum(["claude", "codex"]).optional().describe("이 Role에 사용할 Agent override"),
  model: z.string().nullable().optional().describe("이 Role에 사용할 CLI 모델 override"),
});

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
  instruction: z.string().min(1).describe("Claude/Codex CLI에게 전달할 작업 지시사항"),
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
  purpose: z
    .enum(["implement", "analyze", "review"])
    .optional()
    .describe(
      "이 Task의 목적. implement=쓰기 가능한 구현+리뷰, analyze=읽기 전용 분석, review=읽기 전용 " +
        "리뷰. 생략하면 implement로 처리된다 (권장: 항상 명시). 각 목적이 실제로 사용할 Agent/모델은 " +
        "Settings의 역할별(구현/분석/리뷰) 기본값을 따르며, roleOverrides로 이 Task에서만 바꿀 수 있다.",
    ),
  roleOverrides: z
    .object({
      implementer: roleOverrideSchema.optional(),
      analyzer: roleOverrideSchema.optional(),
      reviewer: roleOverrideSchema.optional(),
    })
    .nullable()
    .optional()
    .describe(
      "purpose가 실제로 사용하는 역할(구현/분석/리뷰)에 한해 이 Task에서만 Agent/모델을 override한다. " +
        "생략하면 Settings의 역할별 기본값을 사용한다.",
    ),
  workflow: workflowSpecSchema
    .nullable()
    .optional()
    .describe(
      "[고급/레거시] Step을 직접 지정해 purpose/roleOverrides를 완전히 무시하고 이 Workflow를 그대로 " +
        "실행한다. 일반적으로는 purpose를 사용하라.",
    ),
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
  acceptanceCriteria: z
    .array(z.object({ id: z.string().min(1), text: z.string().min(1) }))
    .nullable()
    .optional()
    .describe(
      "이 Task의 완료 조건 목록 (선택). 생략하면 첫 리뷰 실행 시 지시사항으로부터 자동으로 도출된다.",
    ),
  // reviewLoopCount is deliberately NOT part of this shape — it's set only by
  // the server's own Auto Fix orchestrator when it creates a follow-up Task
  // directly via taskService.createTask, never by an external REST/MCP caller.
};

export const taskSpecSchema = z.object(taskSpecShape);
export type TaskSpec = z.infer<typeof taskSpecSchema>;
