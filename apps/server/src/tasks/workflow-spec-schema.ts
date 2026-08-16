import { z } from "zod";

/**
 * Single source of truth for validating a WorkflowSpec (agent/action/permission
 * per step). Used by Settings (default workflow), Task creation (REST +
 * MCP `run_task`/`run_tasks`), so all three accept/validate the same shape.
 */
export const workflowStepSpecSchema = z.object({
  agent: z.enum(["claude", "codex"]).describe("이 Step을 실행할 Agent"),
  action: z.enum(["implement", "analyze", "review"]).describe("이 Step이 하는 일"),
  permission: z.enum(["write", "read-only"]).describe("파일 쓰기 허용 여부"),
  model: z
    .string()
    .nullable()
    .optional()
    .describe("이 Step에 사용할 CLI 모델 override (생략하면 Agent CLI 기본값)"),
});

export const workflowSpecSchema = z
  .object({ steps: z.array(workflowStepSpecSchema).min(1) })
  .describe("실행할 Workflow. 생략하면 Settings의 기본 Workflow를 사용한다.");
