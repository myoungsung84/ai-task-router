import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AgentUsage,
  UsageAccount,
  UsageAccountMatch,
  UsageWindow,
} from "@ai-task-router/shared";
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
  windowMinutes?: number;
  resetsAt?: number;
}

/**
 * Two shapes are read, not one.
 *
 * `version: 2` carries `accountUuid` plus `primary`/`secondary`. A snapshot
 * written before that is `fiveHour`/`sevenDay` with no account, and it stays
 * on disk until the next interactive turn overwrites it — so refusing to read
 * it would blank the panel for everyone who upgrades without opening Claude
 * Code first. It is read, and reported as `UNVERIFIABLE`.
 */
interface Snapshot {
  version?: number;
  observedAt?: number;
  accountUuid?: string | null;
  primary?: SnapshotWindow | null;
  secondary?: SnapshotWindow | null;
  fiveHour?: SnapshotWindow | null;
  sevenDay?: SnapshotWindow | null;
}

interface OauthAccount {
  emailAddress?: string;
  organizationName?: string;
  userRateLimitTier?: string;
  accountUuid?: string;
}

/** The durations the pre-`version: 2` snapshot's key names stated, for snapshots that carry no length of their own. */
const LEGACY_WINDOW_MINUTES = { primary: 300, secondary: 10080 } as const;

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

interface CurrentAccount {
  account: UsageAccount | null;
  /** Opaque id used only to compare against the snapshot. Never returned to the client. */
  uuid: string | null;
}

function readAccount(): CurrentAccount {
  const config = readJsonFile<{ oauthAccount?: OauthAccount }>(CLAUDE_CONFIG);
  const account = config?.oauthAccount;
  if (!account) return { account: null, uuid: null };
  return {
    account: {
      email: account.emailAddress ?? null,
      plan: planLabel(account.userRateLimitTier),
      organization: account.organizationName ?? null,
    },
    uuid: account.accountUuid ?? null,
  };
}

/**
 * Does this snapshot belong to the account currently signed in?
 *
 * A snapshot with no id cannot be checked either way, and saying so is the
 * honest answer — the alternative was to keep showing it as if it had been.
 */
function accountMatchOf(snapshot: Snapshot | null, currentUuid: string | null): UsageAccountMatch {
  const stamped = snapshot?.accountUuid;
  if (!snapshot || !stamped || !currentUuid) return "UNVERIFIABLE";
  return stamped === currentUuid ? "VERIFIED" : "MISMATCHED";
}

function toWindow(
  value: SnapshotWindow | null | undefined,
  fallbackMinutes: number,
): UsageWindow | null {
  if (!value || typeof value.usedPercent !== "number") return null;
  // The hook writes 0 rather than null when Claude reported no reset time, so
  // 0 means "absent" here, not "the epoch".
  const resetsAtMs =
    typeof value.resetsAt === "number" && value.resetsAt > 0 ? value.resetsAt * 1000 : null;
  const expired = resetsAtMs !== null && resetsAtMs <= Date.now();
  // An expired window reports null, not 0. The window did roll over, so the
  // last-seen percentage describes something that no longer exists — but "it
  // is now 0% used" is a claim about the new window that nothing here read.
  // Only the next interactive turn can supply that.
  const usedPercent = expired ? null : clampPercent(value.usedPercent);
  return {
    usedPercent,
    remainingPercent: usedPercent === null ? null : 100 - usedPercent,
    windowMinutes:
      typeof value.windowMinutes === "number" && value.windowMinutes > 0
        ? value.windowMinutes
        : fallbackMinutes,
    resetsAt: resetsAtMs ? new Date(resetsAtMs).toISOString() : null,
    expired,
  };
}

function clampPercent(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
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

/**
 * An identity for the signed-in Claude account, for cache invalidation only.
 *
 * The snapshot is cached for a few seconds, and without this a sign-in as
 * someone else kept serving the previous account's row for the rest of that
 * window. Cheap: one small JSON file. Never leaves the server.
 */
export function claudeAccountKey(): string {
  const { uuid, account } = readAccount();
  return uuid ?? account?.email ?? "none";
}

export async function collectClaudeUsage(): Promise<AgentUsage> {
  const { account, uuid } = readAccount();
  const snapshot = readJsonFile<Snapshot>(SNAPSHOT_FILE);
  const todayTokens = await readTodayTokens();

  const observedAt =
    typeof snapshot?.observedAt === "number"
      ? new Date(snapshot.observedAt * 1000).toISOString()
      : null;

  const accountMatch = accountMatchOf(snapshot, uuid);

  // Limits proven to belong to someone else are not shown at all. Labelling
  // them would still put a number next to this account's name, and that
  // number is about a different plan.
  const mismatched = accountMatch === "MISMATCHED";
  const primary = mismatched
    ? null
    : toWindow(snapshot?.primary ?? snapshot?.fiveHour, LEGACY_WINDOW_MINUTES.primary);
  const secondary = mismatched
    ? null
    : toWindow(snapshot?.secondary ?? snapshot?.sevenDay, LEGACY_WINDOW_MINUTES.secondary);

  // Each of these is a different thing to do about it, so each says which:
  // sign in, install the hook, or open Claude Code once so the hook runs
  // under the account now signed in.
  const unavailable = mismatched
    ? "다른 계정에서 기록된 한도입니다. 현재 계정의 한도는 미확인입니다"
    : !account && !snapshot && todayTokens === null
      ? "Claude CLI 기록을 찾지 못했습니다 (~/.claude)"
      : !snapshot
        ? "한도 스냅샷이 없습니다 — statusline 훅을 설치하세요"
        : null;

  return {
    agent: "claude",
    account,
    primary,
    secondary,
    accountMatch,
    todayTokens,
    // Summed across every project transcript on this machine, whichever
    // account produced it — not a per-account figure, and not comparable with
    // the plan gauges above it.
    todayTokensScope: todayTokens === null ? null : "LOCAL_ALL_SESSIONS",
    observedAt,
    unavailable,
  };
}
