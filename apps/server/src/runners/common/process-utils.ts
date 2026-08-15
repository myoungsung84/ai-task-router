import crossSpawn from "cross-spawn";
import type { ChildProcess } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";

/**
 * Thin wrapper around cross-spawn.
 *
 * Why cross-spawn: on Windows, spawning a `.cmd`/`.bat` shim (Codex CLI is
 * installed as one via npm) requires `shell: true` with plain child_process,
 * which reopens command-injection risk if any argument were ever attacker
 * influenced. cross-spawn runs `.cmd`/`.bat` through `cmd.exe` itself but
 * quotes every argument correctly, so we can keep passing the instruction /
 * prompt as a normal array element — never string-concatenated into a shell
 * command line.
 */
export function safeSpawn(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): ChildProcess {
  const child = crossSpawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    windowsHide: true,
  });
  // We never pipe input to Claude/Codex. Both CLIs will otherwise wait a few
  // seconds for stdin before giving up — closing it immediately skips that
  // wait entirely and removes any chance of a hang on an open, never-closed pipe.
  child.stdin?.end();
  return child;
}

/**
 * Kill a process and its full descendant tree.
 * Plain `child.kill()` on Windows only signals the immediate process; CLIs
 * that shell out further (Claude/Codex both spawn subprocesses for tool
 * calls) can leak children. `taskkill /T /F` reliably takes the whole tree.
 */
export function killProcessTree(pid: number | undefined): void {
  if (!pid) return;

  if (process.platform === "win32") {
    nodeSpawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
    }).on("error", () => {
      // best effort — process may have already exited
    });
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already dead
    }
  }
}
