import { v4 as uuid } from "uuid";
import type { Workflow, WorkflowSpec, WorkflowStep } from "@ai-task-router/shared";

/** Turns a minimal WorkflowSpec (agent/action/permission per step) into a full runnable Workflow with fresh Step ids and PENDING status — used at Task creation time. */
export function buildWorkflowFromSpec(spec: WorkflowSpec): Workflow {
  const steps: WorkflowStep[] = spec.steps.map((s, i) => ({
    id: uuid(),
    order: i + 1,
    agent: s.agent,
    action: s.action,
    permission: s.permission,
    status: "PENDING",
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
    skipReason: null,
  }));
  return { steps };
}
