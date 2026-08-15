import type { ReviewOutcome } from "@ai-task-router/shared";

export interface RunnerLogLine {
  stream: "stdout" | "stderr";
  text: string;
}

export interface AgentRunHandle {
  pid: number | undefined;
  cancel: () => void;
}

/** Outcome of one Workflow Step's CLI run, regardless of which agent ran it. */
export interface AgentRunOutcome {
  exitCode: number | null;
  success: boolean;
  cancelled: boolean;
  /** Trailing chunk of the agent's own output, for a quick glance without opening full logs. */
  summary: string | null;
  /** Present only for `review`-action steps. */
  review: ReviewOutcome | null;
}
