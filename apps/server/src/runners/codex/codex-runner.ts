import fs from "node:fs";
import path from "node:path";
import type { StepAction, StepPermission } from "@ai-task-router/shared";
import { config } from "../../config";
import { safeSpawn, killProcessTree } from "../common/process-utils";
import { REVIEW_OUTPUT_SCHEMA, buildReviewPrompt, parseReviewJson } from "../review-prompt";
import type { AgentRunHandle, AgentRunOutcome, RunnerLogLine } from "../agent-types";

/**
 * Codex, as either an implement/analyze agent or a reviewer — Codex is not
 * pinned to "review only". `permission` maps directly to Codex's own
 * `--sandbox` flag, which is what actually prevents file writes (not just a
 * convention): "write" -> workspace-write, "read-only" -> read-only.
 *
 * Review steps use plain `codex exec` (not `codex exec review`) with
 * `--output-schema`, because the `review` subcommand has its own fixed
 * free-text report format that ignores `--output-schema`, while plain
 * `exec` honors it and returns exactly the `{result, issues[]}` JSON we
 * need — see docs/architecture.md for the full story. Implement/analyze
 * steps use the same plain `exec` with no schema constraint, just the raw
 * instruction as the prompt.
 */
export function runCodexStep(
  action: StepAction,
  permission: StepPermission,
  instruction: string,
  taskTitle: string,
  cwd: string,
  taskDir: string,
  onLog: (line: RunnerLogLine) => void,
): { handle: AgentRunHandle; result: Promise<AgentRunOutcome> } {
  const sandbox: "read-only" | "workspace-write" =
    permission === "write" ? "workspace-write" : "read-only";

  let lastMessagePath: string | null = null;
  const args = ["exec", "--json"];

  if (action === "review") {
    lastMessagePath = path.join(taskDir, "codex-last-message.json");
    const schemaPath = path.join(taskDir, "codex-output-schema.json");
    fs.writeFileSync(schemaPath, JSON.stringify(REVIEW_OUTPUT_SCHEMA, null, 2), "utf8");
    try {
      fs.unlinkSync(lastMessagePath);
    } catch {
      // fine if it didn't exist yet
    }
    args.push("-o", lastMessagePath, "--output-schema", schemaPath);
  }

  args.push("--sandbox", sandbox);
  if (config.codexModel) args.push("-m", config.codexModel);

  const prompt = action === "review" ? buildReviewPrompt(taskTitle, instruction) : instruction;
  args.push(prompt);

  const child = safeSpawn(config.codexBin, args, { cwd });

  let cancelled = false;
  let lastAgentMessage = "";
  const stdoutBuf = { partial: "" };
  const stderrBuf = { partial: "" };

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  // `codex exec --json` emits one JSON event per line (thread.started,
  // turn.started, item.started/item.completed for each tool call or agent
  // message, turn.completed). We turn the ones worth showing into a
  // human-readable log line and remember the latest agent_message text as
  // the run's summary; anything unrecognized falls back to the raw line so
  // nothing is silently dropped.
  const emitJsonLine = (line: string) => {
    if (!line.trim()) return;
    let friendly: string | null = null;
    try {
      const parsed = JSON.parse(line) as { type?: string; item?: Record<string, unknown> };
      const item = parsed.item;
      if (parsed.type === "item.started" && item?.type === "command_execution") {
        friendly = `$ ${String(item.command ?? "").slice(0, 300)}`;
      } else if (parsed.type === "item.completed" && item?.type === "command_execution") {
        friendly = `(exit ${String(item.exit_code)}) ${String(item.command ?? "").slice(0, 200)}`;
      } else if (parsed.type === "item.completed" && item?.type === "agent_message") {
        friendly = String(item.text ?? "");
        lastAgentMessage = friendly;
      } else if (parsed.type === "turn.started") {
        friendly = "Codex 턴을 시작합니다...";
      } else if (parsed.type === "turn.completed") {
        friendly = null; // usage stats only — not worth a log line
      }
    } catch {
      friendly = line; // not JSON (or a partial line) — show it verbatim
    }
    if (friendly) onLog({ stream: "stdout", text: friendly });
  };

  child.stdout?.on("data", (chunk: string) => {
    const combined = stdoutBuf.partial + chunk;
    const parts = combined.split(/\r?\n/);
    stdoutBuf.partial = parts.pop() ?? "";
    for (const line of parts) emitJsonLine(line);
  });

  child.stderr?.on("data", (chunk: string) => {
    const combined = stderrBuf.partial + chunk;
    const parts = combined.split(/\r?\n/);
    stderrBuf.partial = parts.pop() ?? "";
    for (const line of parts) {
      if (line.length === 0) continue;
      onLog({ stream: "stderr", text: line });
    }
  });

  const result = new Promise<AgentRunOutcome>((resolve) => {
    const finish = (exitCode: number | null) => {
      if (stdoutBuf.partial) emitJsonLine(stdoutBuf.partial);
      if (stderrBuf.partial) onLog({ stream: "stderr", text: stderrBuf.partial });

      const success = !cancelled && exitCode === 0;
      const summary = lastAgentMessage.trim() || null;

      if (action !== "review") {
        resolve({ exitCode, success, cancelled, summary, review: null });
        return;
      }

      const raw = lastMessagePath ? readFileSafe(lastMessagePath) : null;
      const parsed = success && raw ? parseReviewJson(raw) : null;
      if (!parsed) {
        onLog({
          stream: "stderr",
          text: `Codex 리뷰 실행/결과 파싱에 실패했습니다 (exitCode=${String(exitCode)}).`,
        });
        resolve({
          exitCode,
          success,
          cancelled,
          summary,
          review: success
            ? {
                result: "WARNING",
                issues: [
                  {
                    severity: "high",
                    file: "",
                    message: `Codex 리뷰 결과를 파싱하지 못했습니다 (exitCode=${String(exitCode)}). 로그를 확인하세요.`,
                  },
                ],
                raw,
              }
            : null,
        });
        return;
      }
      resolve({ exitCode, success, cancelled, summary, review: parsed });
    };

    child.on("error", (err) => {
      onLog({ stream: "stderr", text: `Codex CLI 실행 오류: ${err.message}` });
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

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
