import type { ReviewOutcome } from "@ai-task-router/shared";
import type { RunFailure } from "./common/run-failure";

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
  /**
   * Why the run produced no usable result — `null` when it succeeded.
   *
   * `success: false` alone cannot tell a usage limit from an auth error from
   * a response this app truncated, and those need different things from the
   * person reading the Task.
   */
  failure: RunFailure | null;
}
