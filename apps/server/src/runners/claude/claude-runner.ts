import type { ChildProcess } from "node:child_process";
import { config } from "../../config";
import { safeSpawn, killProcessTree } from "../common/process-utils";

export interface RunnerLogLine {
  stream: "stdout" | "stderr";
  text: string;
}

export interface ClaudeRunHandle {
  process: ChildProcess;
  pid: number | undefined;
  cancel: () => void;
}

export interface ClaudeRunResult {
  exitCode: number | null;
  success: boolean;
  /** Trailing chunk of stdout, used as a quick-glance summary. */
  summary: string;
  cancelled: boolean;
}

function splitLines(buffer: { partial: string }, chunk: string): string[] {
  const combined = buffer.partial + chunk;
  const parts = combined.split(/\r?\n/);
  buffer.partial = parts.pop() ?? "";
  return parts;
}

/**
 * Runs `claude -p "<instruction>"` with cwd = the task's project path.
 * The instruction is passed as a single argv element (never interpolated
 * into a shell string), so nothing in it can break out into a shell command.
 */
export function runClaude(
  instruction: string,
  cwd: string,
  onLog: (line: RunnerLogLine) => void,
): { handle: ClaudeRunHandle; result: Promise<ClaudeRunResult> } {
  const args = ["-p", instruction, "--permission-mode", config.claudePermissionMode];

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
      tailSummary = (tailSummary + "\n" + line).slice(-2000);
    }
  });

  child.stderr?.on("data", (chunk: string) => {
    for (const line of splitLines(stderrBuf, chunk)) {
      if (line.length === 0) continue;
      onLog({ stream: "stderr", text: line });
    }
  });

  const result = new Promise<ClaudeRunResult>((resolve) => {
    child.on("error", (err) => {
      onLog({ stream: "stderr", text: `Claude CLI 실행 오류: ${err.message}` });
      resolve({ exitCode: null, success: false, summary: tailSummary, cancelled });
    });

    child.on("close", (code) => {
      if (stdoutBuf.partial) onLog({ stream: "stdout", text: stdoutBuf.partial });
      if (stderrBuf.partial) onLog({ stream: "stderr", text: stderrBuf.partial });
      resolve({
        exitCode: code,
        success: !cancelled && code === 0,
        summary: tailSummary.trim(),
        cancelled,
      });
    });
  });

  const handle: ClaudeRunHandle = {
    process: child,
    pid: child.pid,
    cancel: () => {
      cancelled = true;
      killProcessTree(child.pid);
    },
  };

  return { handle, result };
}
