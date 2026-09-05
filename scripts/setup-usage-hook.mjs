#!/usr/bin/env node
/**
 * Installs (or removes) the Claude Code status line wrapper that feeds the
 * dashboard's usage panel.
 *
 * This edits a file outside the repository — the user's `settings.json` — so it
 * behaves like something that knows it is a guest: it prints exactly what it
 * will change and waits for confirmation, it backs the file up first, it can be
 * run twice with no effect the second time, and `--uninstall` puts the original
 * command back from the record it kept rather than from a guess.
 *
 *   pnpm setup:usage-hook              install, with a confirmation prompt
 *   pnpm setup:usage-hook -- --yes     install without asking (for scripts)
 *   pnpm uninstall:usage-hook          restore the previous status line
 *
 * See docs/usage-panel.md.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { claudeConfigDir, HOOK_FILE, SNAPSHOT_FILE } from "./usage-snapshot.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WRAPPER_PATH = path.join(SCRIPT_DIR, "usage-snapshot.mjs");

const args = new Set(process.argv.slice(2));
const UNINSTALL = args.has("--uninstall");
const ASSUME_YES = args.has("--yes") || args.has("-y");

/** The exact `statusLine.command` this installs. Also how it recognises itself. */
function wrapperCommand() {
  // Forward slashes even on Windows: the value is run through a shell, and a
  // backslash path inside a JSON string is both escaped twice and read as an
  // escape sequence by some shells.
  return `node "${WRAPPER_PATH.replace(/\\/g, "/")}"`;
}

function isWrapper(command) {
  return typeof command === "string" && command.includes("usage-snapshot.mjs");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** `settings.json.bak-20260905-081500` — never overwrites an existing backup. */
function backup(file) {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  const target = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, target);
  return target;
}

async function confirm(question) {
  if (ASSUME_YES) return true;
  if (!process.stdin.isTTY) {
    console.log("\n비대화형 환경입니다. 확인 없이 진행하려면 --yes 를 붙여 다시 실행하세요.");
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`${question} [y/N] `, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function install() {
  const configDir = claudeConfigDir();
  const settingsFile = path.join(configDir, "settings.json");
  const hookFile = path.join(configDir, HOOK_FILE);

  const settings = readJson(settingsFile) ?? {};
  const current = settings.statusLine?.command ?? null;

  if (isWrapper(current)) {
    console.log("이미 설치되어 있습니다. 변경하지 않았습니다.");
    console.log(`  settings : ${settingsFile}`);
    console.log(`  스냅샷   : ${path.join(configDir, SNAPSHOT_FILE)}`);
    return;
  }

  console.log("다음을 변경합니다.\n");
  console.log(`  파일 : ${settingsFile}`);
  console.log(`  이전 : statusLine.command = ${current ?? "(없음)"}`);
  console.log(`  이후 : statusLine.command = ${wrapperCommand()}\n`);
  console.log(
    current
      ? "기존 상태줄은 그대로 실행되고 출력도 그대로입니다. 앞에서 한도만 기록합니다."
      : "설정된 상태줄이 없어 최소한의 줄(디렉터리 | 모델)을 대신 출력합니다.",
  );
  console.log(`한도는 ${path.join(configDir, SNAPSHOT_FILE)} 에 기록됩니다.\n`);

  if (!(await confirm("진행할까요?"))) {
    console.log("취소했습니다.");
    process.exitCode = 1;
    return;
  }

  const backupFile = backup(settingsFile);
  // The original command is recorded beside the snapshot rather than inside
  // settings.json, so uninstall restores what was actually there instead of
  // inferring it, and the wrapper needs no nested quoting in its own argv.
  writeJson(hookFile, {
    wrappedCommand: current,
    wrappedStatusLine: settings.statusLine ?? null,
    installedAt: new Date().toISOString(),
  });

  settings.statusLine = {
    ...(settings.statusLine ?? { type: "command" }),
    command: wrapperCommand(),
  };
  if (!settings.statusLine.type) settings.statusLine.type = "command";
  writeJson(settingsFile, settings);

  console.log("설치했습니다.");
  if (backupFile) console.log(`  백업 : ${backupFile}`);
  console.log("  Claude Code 세션을 새로 열면 다음 턴부터 한도가 기록됩니다.");
}

async function uninstall() {
  const configDir = claudeConfigDir();
  const settingsFile = path.join(configDir, "settings.json");
  const hookFile = path.join(configDir, HOOK_FILE);

  const settings = readJson(settingsFile);
  if (!settings || !isWrapper(settings.statusLine?.command)) {
    console.log("설치되어 있지 않습니다. 변경하지 않았습니다.");
    return;
  }

  const hook = readJson(hookFile);
  const restored = hook?.wrappedStatusLine ?? null;

  console.log("다음을 되돌립니다.\n");
  console.log(`  파일 : ${settingsFile}`);
  console.log(`  이전 : statusLine.command = ${settings.statusLine.command}`);
  console.log(`  이후 : statusLine.command = ${restored?.command ?? "(제거)"}\n`);

  if (!(await confirm("진행할까요?"))) {
    console.log("취소했습니다.");
    process.exitCode = 1;
    return;
  }

  const backupFile = backup(settingsFile);
  if (restored) settings.statusLine = restored;
  else delete settings.statusLine;
  writeJson(settingsFile, settings);

  // The snapshot is left in place on purpose: it is the last known reading, and
  // deleting it would make the dashboard claim the limits are unknown when they
  // are merely no longer being refreshed.
  try {
    fs.unlinkSync(hookFile);
  } catch {
    // already gone
  }

  console.log("제거했습니다.");
  if (backupFile) console.log(`  백업 : ${backupFile}`);
}

await (UNINSTALL ? uninstall() : install());
