import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentUsage, UsageAccount, UsageWindow } from "@ai-task-router/shared";
import { forEachJsonLine, readJsonFile } from "./jsonl";
import { isToday, startOfTodayMs } from "./kst";

const CLAUDE_HOME = path.join(os.homedir(), ".claude");
const CLAUDE_CONFIG = path.join(os.homedir(), ".claude.json");
const PROJECTS_DIR = path.join(CLAUDE_HOME, "projects");

/**
 * Where the status line drops its rate-limit snapshot.
 *
 * Claude Code hands the 5-hour/7-day percentages to the status line command on
 * stdin and persists them nowhere — no file under `~/.claude`, no CLI
 * subcommand, and not in `claude -p --output-format json`'s result either. The
 * status line is therefore the only place those numbers surface at all, so the
 * user's `~/.claude/statusline.sh` appends a one-line dump here and this reads
 * it back. See `docs/usage-panel.md` for the snippet.
 *
 * The consequence, which the panel states rather than hides: this file only
 * moves while an interactive Claude session is rendering, so headless
 * `claude -p` runs (everything this app itself launches) never refresh it.
 */
const SNAPSHOT_FILE = path.join(CLAUDE_HOME, "usage-snapshot.json");

interface SnapshotWindow {
  usedPercent?: number;
  resetsAt?: number;
}

interface Snapshot {
  observedAt?: number;
  fiveHour?: SnapshotWindow;
  sevenDay?: SnapshotWindow;
}

interface OauthAccount {
  emailAddress?: string;
  organizationName?: string;
  userRateLimitTier?: string;
}

/**
 * `default_claude_max_5x` -> `Max 5x`. The tier strings are an internal
 * identifier rather than a label, so anything unrecognized is title-cased
 * instead of dropped — an unfamiliar plan should still show *something*.
 */
function planLabel(tier: string | undefined): string | null {
  if (!tier) return null;
  const bare = tier.replace(/^default_/, "").replace(/^claude_/, "");
  const known: Record<string, string> = {
    max_5x: "Max 5x",
    max_20x: "Max 20x",
    pro: "Pro",
    free: "Free",
    team: "Team",
    enterprise: "Enterprise",
  };
  if (known[bare]) return known[bare];
  return bare
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readAccount(): UsageAccount | null {
  const config = readJsonFile<{ oauthAccount?: OauthAccount }>(CLAUDE_CONFIG);
  const account = config?.oauthAccount;
  if (!account) return null;
  return {
    email: account.emailAddress ?? null,
    plan: planLabel(account.userRateLimitTier),
    organization: account.organizationName ?? null,
  };
}

function toWindow(value: SnapshotWindow | undefined): UsageWindow | null {
  if (!value || typeof value.usedPercent !== "number") return null;
  // The shell hook writes 0 rather than null when Claude reported no reset
  // time, so 0 means "absent" here, not "the epoch".
  const resetsAtMs =
    typeof value.resetsAt === "number" && value.resetsAt > 0 ? value.resetsAt * 1000 : null;
  const expired = resetsAtMs !== null && resetsAtMs <= Date.now();
  return {
    usedPercent: expired ? 0 : value.usedPercent,
    resetsAt: resetsAtMs ? new Date(resetsAtMs).toISOString() : null,
    expired,
  };
}

/**
 * Every token Claude processed today, summed across every project's transcript.
 *
 * Cache reads are counted alongside fresh input rather than excluded. They are
 * by far the largest number in a coding session, and leaving them out would
 * report a figure that looks reassuringly small while saying nothing about how
 * hard the model was actually working — and it would also stop matching Codex's
 * `total_tokens`, whose input already includes its cached portion.
 */
async function readTodayTokens(): Promise<number | null> {
  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return null;
  }

  const since = startOfTodayMs();
  let total = 0;
  let sawAnyFile = false;

  for (const dir of projectDirs) {
    const dirPath = path.join(PROJECTS_DIR, dir);
    let entries: string[];
    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const filePath = path.join(dirPath, entry);
      // mtime is only a pre-filter: a session that started yesterday and ran
      // past midnight is still touched today, and its per-line timestamps below
      // are what actually decide which turns count.
      let mtimeMs: number;
      try {
        mtimeMs = fs.statSync(filePath).mtimeMs;
      } catch {
        continue;
      }
      if (mtimeMs < since) continue;
      sawAnyFile = true;

      await forEachJsonLine(filePath, (line) => {
        if (line.type !== "assistant") return;
        const timestamp = typeof line.timestamp === "string" ? line.timestamp : null;
        if (!timestamp) return;
        const at = new Date(timestamp);
        if (Number.isNaN(at.getTime()) || !isToday(at)) return;

        const message = line.message as { usage?: Record<string, unknown> } | undefined;
        const usage = message?.usage;
        if (!usage) return;
        for (const key of [
          "input_tokens",
          "output_tokens",
          "cache_creation_input_tokens",
          "cache_read_input_tokens",
        ]) {
          const value = usage[key];
          if (typeof value === "number" && Number.isFinite(value)) total += value;
        }
      });
    }
  }

  return sawAnyFile ? total : 0;
}

export async function collectClaudeUsage(): Promise<AgentUsage> {
  const account = readAccount();
  const snapshot = readJsonFile<Snapshot>(SNAPSHOT_FILE);
  const todayTokens = await readTodayTokens();

  const observedAt =
    typeof snapshot?.observedAt === "number"
      ? new Date(snapshot.observedAt * 1000).toISOString()
      : null;

  const fiveHour = toWindow(snapshot?.fiveHour);
  const sevenDay = toWindow(snapshot?.sevenDay);

  // Account but no snapshot is the ordinary "hook not installed yet" state, and
  // it is worth naming precisely: without it the panel would just show two
  // empty gauges and look broken.
  const unavailable =
    !account && !snapshot && todayTokens === null
      ? "Claude CLI 기록을 찾지 못했습니다 (~/.claude)"
      : !snapshot
        ? "한도 스냅샷이 없습니다 — statusline 훅을 설치하세요"
        : null;

  return {
    agent: "claude",
    account,
    fiveHour,
    sevenDay,
    todayTokens,
    observedAt,
    unavailable,
  };
}
