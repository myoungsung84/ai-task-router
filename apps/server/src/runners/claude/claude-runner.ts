import type { AcceptanceCriterion, StepAction, StepPermission } from "@ai-task-router/shared";
import { config } from "../../config";
import { safeSpawn, killProcessTree } from "../common/process-utils";
import { classifyFailure, runFailure, type RunFailureKind } from "../common/run-failure";
import { buildReviewPrompt, parseReviewJson } from "../review-prompt";
import type { AgentRunHandle, AgentRunOutcome, RunnerLogLine } from "../agent-types";

function splitLines(buffer: { partial: string }, chunk: string): string[] {
  const combined = buffer.partial + chunk;
  const parts = combined.split(/\r?\n/);
  buffer.partial = parts.pop() ?? "";
  return parts;
}

/**
 * How much of a review answer is kept for parsing.
 *
 * This exists because the tail kept for the human-readable `summary` used to
 * be the *same* buffer the review JSON was parsed from — 4000 characters. A
 * review with eight Acceptance Criteria runs past that, so the JSON arrived
 * with its opening brace cut off and every such review failed to parse while
 * the CLI reported success. The two buffers are now separate: the summary is
 * still a short tail, and this is a bound that no real review reaches.
 *
 * It is a memory bound, not a format limit. When it is hit the run reports
 * RESPONSE_TRUNCATED rather than a parse failure, because the answer was
 * fine and this app is what dropped part of it.
 */
const REVIEW_OUTPUT_LIMIT = 2_000_000;

/** The last N characters, for a glance at what the agent said without opening full logs. */
const SUMMARY_TAIL_LIMIT = 4000;

/**
 * Claude, as either an implement/analyze agent or a reviewer — Claude is not
 * pinned to one role. `permission` picks the CLI's permission mode:
 * "write" -> acceptEdits (auto-accepts file edits), "read-only" -> plan
 * (Claude reasons/reports but the CLI itself blocks actual edits).
 *
 * The instruction is always passed as a single argv element (never
 * interpolated into a shell string), so nothing in it can break out into a
 * shell command.
 */
export function runClaudeStep(
  action: StepAction,
  permission: StepPermission,
  model: string | null,
  instruction: string,
  taskTitle: string,
  cwd: string,
  onLog: (line: RunnerLogLine) => void,
  acceptanceCriteria?: AcceptanceCriterion[] | null,
  implementationReport?: string | null,
): { handle: AgentRunHandle; result: Promise<AgentRunOutcome> } {
  const prompt =
    action === "review"
      ? buildReviewPrompt(taskTitle, instruction, acceptanceCriteria, implementationReport)
      : instruction;
  const permissionMode = permission === "write" ? config.claudePermissionMode : "plan";

  const args = ["-p", prompt, "--permission-mode", permissionMode];
  if (model) args.push("--model", model);
  const child = safeSpawn(config.claudeBin, args, { cwd });

  let cancelled = false;
  const stdoutBuf = { partial: "" };
  const stderrBuf = { partial: "" };
  let tailSummary = "";
  // Kept whole (up to REVIEW_OUTPUT_LIMIT) so the review JSON is parsed from
  // the full answer rather than from the summary tail.
  let reviewOutput = "";
  let reviewOutputTruncated = false;
  // Both streams feed failure classification: the CLI prints "usage limit
  // reached" and login prompts on either one depending on version.
  const failureLines: string[] = [];

  const appendOutput = (line: string) => {
    tailSummary = (tailSummary + "\n" + line).slice(-SUMMARY_TAIL_LIMIT);
    if (reviewOutput.length >= REVIEW_OUTPUT_LIMIT) {
      reviewOutputTruncated = true;
      return;
    }
    reviewOutput += (reviewOutput ? "\n" : "") + line;
    if (reviewOutput.length > REVIEW_OUTPUT_LIMIT) {
      reviewOutput = reviewOutput.slice(0, REVIEW_OUTPUT_LIMIT);
      reviewOutputTruncated = true;
    }
  };

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  child.stdout?.on("data", (chunk: string) => {
    for (const line of splitLines(stdoutBuf, chunk)) {
      if (line.length === 0) continue;
      onLog({ stream: "stdout", text: line });
      appendOutput(line);
      failureLines.push(line);
    }
  });

  child.stderr?.on("data", (chunk: string) => {
    for (const line of splitLines(stderrBuf, chunk)) {
      if (line.length === 0) continue;
      onLog({ stream: "stderr", text: line });
      failureLines.push(line);
    }
  });

  const result = new Promise<AgentRunOutcome>((resolve) => {
    const failureKind = (): RunFailureKind =>
      cancelled ? "CANCELLED" : (classifyFailure(failureLines) ?? "EXECUTION_FAILED");

    const finish = (exitCode: number | null) => {
      // A trailing chunk with no newline stays in `partial`. It used to be
      // logged but never appended, so when the CLI ended its output without a
      // final newline the last line — the end of the JSON — was dropped from
      // what got parsed.
      if (stdoutBuf.partial) {
        onLog({ stream: "stdout", text: stdoutBuf.partial });
        appendOutput(stdoutBuf.partial);
        failureLines.push(stdoutBuf.partial);
        stdoutBuf.partial = "";
      }
      if (stderrBuf.partial) {
        onLog({ stream: "stderr", text: stderrBuf.partial });
        failureLines.push(stderrBuf.partial);
        stderrBuf.partial = "";
      }

      const exited = !cancelled && exitCode === 0;
      const summary = tailSummary.trim() || null;

      if (action !== "review") {
        resolve({
          exitCode,
          success: exited,
          cancelled,
          summary,
          review: null,
          failure: exited ? null : runFailure(failureKind()),
        });
        return;
      }

      if (!exited) {
        const failure = runFailure(failureKind());
        if (!cancelled) {
          onLog({
            stream: "stderr",
            text: `CLAUDE_REVIEW_FAILED(${failure.kind}): ${failure.message} (exitCode=${String(exitCode)})`,
          });
        }
        resolve({ exitCode, success: false, cancelled, summary, review: null, failure });
        return;
      }

      const parsed = parseReviewJson(reviewOutput);
      if (parsed.ok) {
        resolve({
          exitCode,
          success: true,
          cancelled,
          summary,
          review: parsed.review,
          failure: null,
        });
        return;
      }

      // Exited cleanly, but the answer is not a usable review result.
      // Truncation is named as truncation rather than folded into a parse
      // failure: the review may have been perfect and this app is what lost
      // part of it, so the two point at different fixes.
      const failure = runFailure(
        reviewOutputTruncated
          ? "RESPONSE_TRUNCATED"
          : (classifyFailure(failureLines) ?? parsed.kind),
      );
      onLog({
        stream: "stderr",
        text: `CLAUDE_REVIEW_UNUSABLE(${failure.kind}): ${failure.message}`,
      });
      resolve({
        exitCode,
        success: false,
        cancelled,
        summary,
        // Never null and never PASS: an answer nobody could read must surface
        // as something a person has to look at.
        review: {
          result: "WARNING",
          issues: [
            {
              severity: "high",
              // Explicitly OTHER, never left undefined — this is a failure to
              // read the answer, not a finding about the code, and must never
              // be mistaken for a real Security issue.
              category: "OTHER",
              file: "",
              message: failure.message,
            },
          ],
          raw: summary,
        },
        failure,
      });
    };

    child.on("error", (err) => {
      onLog({ stream: "stderr", text: `Claude CLI 실행 오류: ${err.message}` });
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });

  const handle: AgentRunHandle = {
    pid: child.pid,
    cancel: () => {
      cancelled = true;
      killProcessTree(child.pid);
    },
  };

  return { handle, result };
}
