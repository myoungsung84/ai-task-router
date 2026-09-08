#!/usr/bin/env node
/**
 * Claude Code status line wrapper that records the plan limits on the way past.
 *
 * Claude Code hands the status line command a JSON payload on stdin containing
 * `rate_limits.five_hour` / `.seven_day`, and stores those percentages nowhere
 * else — not under the config directory, not in a CLI subcommand, and not in
 * `claude -p --output-format json`'s result. The status line is the only place
 * they surface, so this sits in front of whatever status line was already
 * configured, copies the numbers to a file the dashboard reads, and then runs
 * the original command with the same payload so the terminal looks unchanged.
 *
 * Wrapping rather than patching is deliberate. An earlier version appended a
 * snippet inside one particular `statusline.sh`, which worked only because that
 * script happened to have already parsed the payload into shell variables. A
 * wrapper makes no assumption about how — or whether — the user renders a
 * status line.
 *
 * The command it wraps lives in `usage-hook.json` beside the snapshot rather
 * than in this process's argv, so no quoting of a nested command line has to
 * survive a trip through settings.json and a shell on Windows.
 *
 * Run by `scripts/setup-usage-hook.mjs`; see docs/usage-panel.md.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Honours CLAUDE_CONFIG_DIR, which relocates everything Claude Code stores. */
export function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR
    ? path.resolve(process.env.CLAUDE_CONFIG_DIR)
    : path.join(os.homedir(), ".claude");
}

export const SNAPSHOT_FILE = "usage-snapshot.json";
export const HOOK_FILE = "usage-hook.json";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

/**
 * The account Claude Code is signed in as, or null.
 *
 * Stamped onto the snapshot so the dashboard can tell whether the limits it
 * reads still belong to the account currently signed in. Without it, signing
 * in as someone else left the previous account's percentages rendering under
 * the new name with nothing to catch it.
 *
 * `accountUuid` is an opaque id, not an address — the email is deliberately
 * not copied here. The profile file holds no tokens.
 */
function accountUuid() {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8");
    const id = JSON.parse(raw)?.oauthAccount?.accountUuid;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/**
 * @param value the payload's window object
 * @param impliedMinutes the duration the payload's own key name states, used
 *   only when the window does not report its length itself. Recording the
 *   length at all is the point: the reader must not infer "5 hours" from a
 *   field name it happens to know.
 */
function windowOf(value, impliedMinutes) {
  if (!value || typeof value !== "object") return null;
  const usedPercent = value.used_percentage;
  if (typeof usedPercent !== "number") return null;
  const reported = value.window_minutes;
  return {
    usedPercent,
    windowMinutes: typeof reported === "number" && reported > 0 ? reported : impliedMinutes,
    // 0 stands for "not reported" — the reader treats it as absent rather than
    // as the epoch.
    resetsAt: typeof value.resets_at === "number" ? Math.round(value.resets_at) : 0,
  };
}

/**
 * Writes the snapshot, or does nothing at all if this payload carries no
 * limits. Never throws: a status line that fails takes the whole line down in
 * the user's terminal, and this is the least important thing happening in it.
 */
function writeSnapshot(payload) {
  const limits = payload?.rate_limits;
  const primary = windowOf(limits?.five_hour, 300);
  const secondary = windowOf(limits?.seven_day, 10080);
  if (!primary && !secondary) return;

  const target = path.join(claudeConfigDir(), SNAPSHOT_FILE);
  const body = JSON.stringify({
    version: 2,
    observedAt: Math.floor(Date.now() / 1000),
    accountUuid: accountUuid(),
    // A window Claude did not report is written as null, not as a zeroed
    // window. A zeroed window reads as "0% used", which is a different claim
    // from "not reported".
    primary,
    secondary,
  });

  try {
    // tmp-then-rename so the dashboard never reads a half-written file.
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, `${body}\n`, "utf8");
    fs.renameSync(tmp, target);
  } catch {
    // Unwritable config dir, a read-only home — the status line still renders.
  }
}

function readWrappedCommand() {
  try {
    const raw = fs.readFileSync(path.join(claudeConfigDir(), HOOK_FILE), "utf8");
    const parsed = JSON.parse(raw);
    const command = parsed?.wrappedCommand;
    return typeof command === "string" && command.trim() ? command : null;
  } catch {
    return null;
  }
}

/**
 * The line shown when this wrapper was installed on a setup that had no status
 * line of its own. Printing nothing would leave a blank strip under the prompt
 * and read as a broken install; this states the two things a status line is
 * for at minimum.
 */
function fallbackLine(payload) {
  const model = payload?.model?.display_name;
  const dir = payload?.workspace?.current_dir ?? payload?.cwd;
  const name = typeof dir === "string" ? path.basename(dir.replace(/[\\/]+$/, "")) : null;
  return [name, model].filter(Boolean).join(" | ");
}

async function main() {
  const input = await readStdin();

  let payload = null;
  try {
    payload = JSON.parse(input);
  } catch {
    payload = null;
  }
  if (payload) writeSnapshot(payload);

  const command = readWrappedCommand();
  if (!command) {
    if (payload) process.stdout.write(fallbackLine(payload));
    return;
  }

  // `shell: true` because the wrapped value is a command line the user (or
  // Claude Code's own settings) wrote as a string, exactly as Claude Code would
  // have run it had this wrapper not been in front.
  await new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: ["pipe", "inherit", "inherit"] });
    child.on("error", resolve);
    child.on("close", resolve);
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

// Only run when invoked directly — `setup-usage-hook.mjs` imports the path
// helpers above and must not trigger a status line render by doing so.
// `pathToFileURL` rather than string-building a `file://` URL: a Windows path
// starts with a drive letter and backslashes, neither of which survives being
// concatenated into one.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
