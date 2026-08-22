import fs from "node:fs";
import path from "node:path";
import type { AcceptanceCriterion, StepAction, StepPermission } from "@ai-task-router/shared";
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
  model: string | null,
  instruction: string,
  taskTitle: string,
  cwd: string,
  taskDir: string,
  onLog: (line: RunnerLogLine) => void,
  acceptanceCriteria?: AcceptanceCriterion[] | null,
  implementationReport?: string | null,
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
  // Step-level model (Settings' role config or a per-Task override) wins;
  // CODEX_MODEL is only the fallback for when neither specifies one.
  const effectiveModel = model || config.codexModel;
  if (effectiveModel) args.push("-m", effectiveModel);

  const prompt =
    action === "review"
      ? buildReviewPrompt(taskTitle, instruction, acceptanceCriteria, implementationReport)
      : instruction;
  // Codex is installed as a .cmd shim on Windows. A full review prompt can
  // exceed cmd.exe's command-line limit, so pass it through stdin (`-`) rather
  // than as an argv element. The CLI documents `-` as "read prompt from stdin".
  args.push("-");

  const child = safeSpawn(config.codexBin, args, { cwd, stdin: prompt });

  let cancelled = false;
  let lastAgentMessage = "";
  const stdoutBuf = { partial: "" };
  let stderrBytes = Buffer.alloc(0);
  const executionErrors: string[] = [];

  child.stdout?.setEncoding("utf8");

  function redactSensitiveText(text: string): string {
    return text
      .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED_TOKEN]")
      .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED_TOKEN]")
      .replace(
        /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)\s*[=:]\s*)\S+/g,
        "$1[REDACTED]",
      );
  }

  function decodeStderrLine(bytes: Buffer): string {
    const clean =
      bytes.length > 0 && bytes[bytes.length - 1] === 13 ? bytes.subarray(0, -1) : bytes;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(clean);
    } catch {
      // Windows' cmd.exe writes localized wrapper errors (for example,
      // command-line-too-long) in the active ANSI code page, CP949 on a
      // Korean installation. WHATWG's euc-kr decoder covers CP949.
      return new TextDecoder("euc-kr").decode(clean);
    }
  }

  function emitStderrLine(bytes: Buffer): void {
    if (bytes.length === 0) return;
    const text = redactSensitiveText(decodeStderrLine(bytes));
    executionErrors.push(text);
    onLog({ stream: "stderr", text });
  }

  // Best-effort extraction of a human-readable message out of a `type:
  // "error"` / `type: "turn.failed"` event — the exact shape isn't
  // guaranteed across Codex CLI versions (top-level `message`, a string
  // `error`, or a nested `error.message` have all been observed), so this
  // tries the plausible spots in order and, failing that, falls back to the
  // raw event JSON rather than silently losing the failure reason.
  function extractEventErrorMessage(parsed: Record<string, unknown>): string {
    if (typeof parsed.message === "string" && parsed.message) return parsed.message;
    const err = parsed.error;
    if (typeof err === "string" && err) return err;
    if (err && typeof err === "object") {
      const msg = (err as Record<string, unknown>).message;
      if (typeof msg === "string" && msg) return msg;
    }
    return JSON.stringify(parsed);
  }

  // `codex exec --json` emits one JSON event per line (thread.started,
  // turn.started, item.started/item.completed for each tool call or agent
  // message, turn.completed, and on failure `error`/`turn.failed`). We turn
  // the ones worth showing into a human-readable log line and remember the
  // latest agent_message text as the run's summary. A line that fails to
  // parse as JSON at all falls back to the raw line; a line that parses but
  // has a `type` we don't otherwise recognize is intentionally dropped
  // (`turn.completed`'s usage-stats payload, mainly) — `error`/`turn.failed`
  // are explicitly handled below precisely so *they* are never dropped.
  const emitJsonLine = (line: string) => {
    if (!line.trim()) return;
    let friendly: string | null = null;
    let stream: "stdout" | "stderr" = "stdout";
    try {
      const parsed = JSON.parse(line) as Record<string, unknown> & {
        type?: string;
        item?: Record<string, unknown>;
      };
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
      } else if (parsed.type === "error") {
        friendly = `Codex 오류: ${redactSensitiveText(extractEventErrorMessage(parsed))}`;
        stream = "stderr";
      } else if (parsed.type === "turn.failed") {
        friendly = `Codex 턴 실패: ${redactSensitiveText(extractEventErrorMessage(parsed))}`;
        stream = "stderr";
      }
    } catch {
      friendly = line; // not JSON (or a partial line) — show it verbatim
    }
    if (friendly) onLog({ stream, text: friendly });
  };

  child.stdout?.on("data", (chunk: string) => {
    const combined = stdoutBuf.partial + chunk;
    const parts = combined.split(/\r?\n/);
    stdoutBuf.partial = parts.pop() ?? "";
    for (const line of parts) emitJsonLine(line);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    stderrBytes = Buffer.concat([stderrBytes, chunk]);
    let newline = stderrBytes.indexOf(10);
    while (newline !== -1) {
      emitStderrLine(stderrBytes.subarray(0, newline));
      stderrBytes = stderrBytes.subarray(newline + 1);
      newline = stderrBytes.indexOf(10);
    }
  });

  const result = new Promise<AgentRunOutcome>((resolve) => {
    let finished = false;
    const finish = (exitCode: number | null) => {
      if (finished) return;
      finished = true;
      if (stdoutBuf.partial) emitJsonLine(stdoutBuf.partial);
      if (stderrBytes.length > 0) emitStderrLine(stderrBytes);

      const success = !cancelled && exitCode === 0;
      const summary = lastAgentMessage.trim() || null;

      if (action !== "review") {
        resolve({ exitCode, success, cancelled, summary, review: null });
        return;
      }

      if (!success) {
        if (!cancelled) {
          const detail = executionErrors.at(-1);
          onLog({
            stream: "stderr",
            text: `CODEX_EXECUTION_FAILED: Codex CLI가 비정상 종료했습니다 (exitCode=${String(exitCode)})${detail ? ` — ${detail}` : ""}`,
          });
        }
        resolve({ exitCode, success: false, cancelled, summary, review: null });
        return;
      }

      const raw = lastMessagePath ? readFileSafe(lastMessagePath) : null;
      const parsed = raw ? parseReviewJson(raw) : null;
      if (!parsed) {
        onLog({
          stream: "stderr",
          text: `CODEX_REVIEW_PARSE_FAILED: Codex CLI는 정상 종료했지만 리뷰 JSON을 파싱하지 못했습니다 (exitCode=${String(exitCode)}).`,
        });
        resolve({
          exitCode,
          success: false,
          cancelled,
          summary,
          review: {
            result: "WARNING",
            issues: [
              {
                severity: "high",
                category: "OTHER",
                file: "",
                message: `Codex 리뷰 결과를 파싱하지 못했습니다 (exitCode=${String(exitCode)}). 로그를 확인하세요.`,
              },
            ],
            raw,
          },
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
