import type { AcceptanceCriterion, StepAction, StepPermission } from "@ai-task-router/shared";
import { config } from "../../config";
import { safeSpawn, killProcessTree } from "../common/process-utils";
import { buildReviewPrompt, parseReviewJson } from "../review-prompt";
import type { AgentRunHandle, AgentRunOutcome, RunnerLogLine } from "../agent-types";

function splitLines(buffer: { partial: string }, chunk: string): string[] {
  const combined = buffer.partial + chunk;
  const parts = combined.split(/\r?\n/);
  buffer.partial = parts.pop() ?? "";
  return parts;
}

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

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  child.stdout?.on("data", (chunk: string) => {
    for (const line of splitLines(stdoutBuf, chunk)) {
      if (line.length === 0) continue;
      onLog({ stream: "stdout", text: line });
      tailSummary = (tailSummary + "\n" + line).slice(-4000);
    }
  });

  child.stderr?.on("data", (chunk: string) => {
    for (const line of splitLines(stderrBuf, chunk)) {
      if (line.length === 0) continue;
      onLog({ stream: "stderr", text: line });
    }
  });

  const result = new Promise<AgentRunOutcome>((resolve) => {
    const finish = (exitCode: number | null) => {
      if (stdoutBuf.partial) onLog({ stream: "stdout", text: stdoutBuf.partial });
      if (stderrBuf.partial) onLog({ stream: "stderr", text: stderrBuf.partial });

      const success = !cancelled && exitCode === 0;
      const summary = tailSummary.trim() || null;

      if (action !== "review") {
        resolve({ exitCode, success, cancelled, summary, review: null });
        return;
      }

      const parsed = success ? parseReviewJson(tailSummary) : null;
      if (!parsed) {
        if (success) {
          onLog({
            stream: "stderr",
            text: `CLAUDE_REVIEW_PARSE_FAILED: Claude CLI는 정상 종료했지만 리뷰 JSON을 파싱하지 못했습니다 (exitCode=${String(exitCode)}).`,
          });
        }
        resolve({
          exitCode,
          success: false,
          cancelled,
          summary,
          review: success
            ? {
                result: "WARNING",
                issues: [
                  {
                    severity: "high",
                    // Explicitly OTHER, never left undefined — this is a
                    // parsing failure, not a finding about the code, and must
                    // never be mistaken for a real Security issue.
                    category: "OTHER",
                    file: "",
                    message: "Claude 리뷰 응답에서 구조화된 결과를 파싱하지 못했습니다.",
                  },
                ],
                raw: summary,
              }
            : null,
        });
        return;
      }
      resolve({ exitCode, success, cancelled, summary, review: parsed });
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
