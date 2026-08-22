import type { AcceptanceCriterion, WorkflowStep } from "@ai-task-router/shared";
import { runClaudeStep } from "./claude/claude-runner";
import { runCodexStep } from "./codex/codex-runner";
import type { AgentRunHandle, AgentRunOutcome, RunnerLogLine } from "./agent-types";

/**
 * Single entry point the Workflow Executor uses to run one Step — dispatches
 * to the right agent's runner. Neither the executor nor MCP ever spawns
 * Claude/Codex commands directly; this (and the runner modules it delegates
 * to) is the only place that does.
 */
export function runWorkflowStep(
  step: Pick<WorkflowStep, "agent" | "action" | "permission" | "model">,
  instruction: string,
  taskTitle: string,
  cwd: string,
  taskDir: string,
  onLog: (line: RunnerLogLine) => void,
  acceptanceCriteria?: AcceptanceCriterion[] | null,
  implementationReport?: string | null,
): { handle: AgentRunHandle; result: Promise<AgentRunOutcome> } {
  if (step.agent === "claude") {
    return runClaudeStep(
      step.action,
      step.permission,
      step.model ?? null,
      instruction,
      taskTitle,
      cwd,
      onLog,
      acceptanceCriteria,
      implementationReport,
    );
  }
  return runCodexStep(
    step.action,
    step.permission,
    step.model ?? null,
    instruction,
    taskTitle,
    cwd,
    taskDir,
    onLog,
    acceptanceCriteria,
    implementationReport,
  );
}
