import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentUsage, UsageAccount, UsageWindow } from "@ai-task-router/shared";
import { config } from "../config";
import { forEachJsonLine, readJsonFile } from "./jsonl";
import { isToday, startOfTodayMs } from "./kst";

const CODEX_HOME = path.join(os.homedir(), ".codex");
const SESSIONS_DIR = path.join(CODEX_HOME, "sessions");
const AUTH_FILE = path.join(CODEX_HOME, "auth.json");

/**
 * How many recent rollouts to search for a rate-limit reading before giving up.
 *
 * Codex writes its limits into `token_count` events, so a rollout that never
 * got that far (an immediately-cancelled run, a session that only failed to
 * start) carries none. Walking back a few files finds the last real reading
 * instead of reporting "unknown" because the most recent file happened to be a
 * stub.
 */
const ROLLOUTS_TO_SEARCH = 8;

interface RateLimitWindow {
  used_percent?: number;
  window_minutes?: number;
  resets_at?: number;
}

interface RateLimits {
  primary?: RateLimitWindow;
  secondary?: RateLimitWindow;
  plan_type?: string;
}

interface RolloutFile {
  filePath: string;
  mtimeMs: number;
}

/** Every `rollout-*.jsonl` under `~/.codex/sessions`, newest first. */
function listRollouts(): RolloutFile[] {
  const found: RolloutFile[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.name.endsWith(".jsonl")) {
        try {
          found.push({ filePath: full, mtimeMs: fs.statSync(full).mtimeMs });
        } catch {
          // vanished mid-walk; nothing to record
        }
      }
    }
  };

  walk(SESSIONS_DIR, 0);
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * The email Codex is logged in as, out of the `id_token` in `~/.codex/auth.json`.
 *
 * That file also holds live `access_token` / `refresh_token` credentials, so it
 * is not opened at all unless `USAGE_SHOW_ACCOUNT` is on — the account label is
 * a convenience, and a tool that reads a credential file by default has to
 * justify itself to everyone who ever clones it. With the flag on, only the
 * id_token's `email` claim is pulled out, and nothing from this file is logged,
 * cached to disk, or returned in any other shape: the payload is decoded, one
 * string is copied, and the rest is dropped. Treat any change here as a
 * security change — the whole point is that a credential file is read without
 * any part of a credential leaving this function.
 */
function readCodexEmail(): string | null {
  if (!config.usageShowAccount) return null;
  const auth = readJsonFile<{ tokens?: { id_token?: string } }>(AUTH_FILE);
  const idToken = auth?.tokens?.id_token;
  if (typeof idToken !== "string") return null;

  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    const claims = JSON.parse(json) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

/** `plus` -> `Plus`, `pro` -> `Pro`. */
function planLabel(planType: string | undefined): string | null {
  if (!planType) return null;
  return planType.charAt(0).toUpperCase() + planType.slice(1);
}

function toWindow(value: RateLimitWindow | undefined): UsageWindow | null {
  if (!value || typeof value.used_percent !== "number") return null;
  const resetsAtMs = typeof value.resets_at === "number" ? value.resets_at * 1000 : null;
  const expired = resetsAtMs !== null && resetsAtMs <= Date.now();
  return {
    usedPercent: expired ? 0 : value.used_percent,
    resetsAt: resetsAtMs ? new Date(resetsAtMs).toISOString() : null,
    expired,
  };
}

interface LatestLimits {
  rateLimits: RateLimits;
  observedAt: string | null;
}

/** The most recent `token_count` event carrying rate limits, or null. */
async function readLatestLimits(rollouts: RolloutFile[]): Promise<LatestLimits | null> {
  for (const rollout of rollouts.slice(0, ROLLOUTS_TO_SEARCH)) {
    let latest: LatestLimits | null = null;
    await forEachJsonLine(rollout.filePath, (line) => {
      const payload = line.payload as { type?: string; rate_limits?: RateLimits } | undefined;
      if (payload?.type !== "token_count" || !payload.rate_limits) return;
      // Keep scanning to the end of the file: later events supersede earlier
      // ones, and a session's last reading is its most current.
      latest = {
        rateLimits: payload.rate_limits,
        observedAt: typeof line.timestamp === "string" ? line.timestamp : null,
      };
    });
    if (latest) return latest;
  }
  return null;
}

/**
 * Tokens Codex used today, summed from each turn's `last_token_usage`.
 *
 * Deliberately not `total_token_usage`, which is cumulative per session: a
 * session that began yesterday and continued this morning would contribute
 * yesterday's tokens to today's figure. Summing the per-turn deltas whose
 * timestamps land today is exact — verified against a real rollout, where the
 * deltas add up to the session's own reported total.
 */
async function readTodayTokens(rollouts: RolloutFile[]): Promise<number> {
  const since = startOfTodayMs();
  let total = 0;

  for (const rollout of rollouts) {
    if (rollout.mtimeMs < since) break; // sorted newest first — the rest are older
    await forEachJsonLine(rollout.filePath, (line) => {
      const payload = line.payload as
        { type?: string; info?: { last_token_usage?: { total_tokens?: unknown } } } | undefined;
      if (payload?.type !== "token_count") return;
      const timestamp = typeof line.timestamp === "string" ? line.timestamp : null;
      if (!timestamp) return;
      const at = new Date(timestamp);
      if (Number.isNaN(at.getTime()) || !isToday(at)) return;
      const turnTotal = payload.info?.last_token_usage?.total_tokens;
      if (typeof turnTotal === "number" && Number.isFinite(turnTotal)) total += turnTotal;
    });
  }

  return total;
}

export async function collectCodexUsage(): Promise<AgentUsage> {
  const rollouts = listRollouts();
  const email = readCodexEmail();
  if (rollouts.length === 0) {
    return {
      agent: "codex",
      account: email ? { email, plan: null, organization: null } : null,
      fiveHour: null,
      sevenDay: null,
      todayTokens: null,
      observedAt: null,
      unavailable: "Codex 세션 기록을 찾지 못했습니다 (~/.codex/sessions)",
    };
  }

  const latest = await readLatestLimits(rollouts);
  const todayTokens = await readTodayTokens(rollouts);

  const account: UsageAccount = {
    email,
    // The plan comes from the rollout rather than the auth token: it is the
    // same value, and reading it here means the credential file is not touched
    // for anything the row itself displays.
    plan: planLabel(latest?.rateLimits.plan_type),
    organization: null,
  };

  return {
    agent: "codex",
    account,
    fiveHour: toWindow(latest?.rateLimits.primary),
    sevenDay: toWindow(latest?.rateLimits.secondary),
    todayTokens,
    observedAt: latest?.observedAt ?? null,
    unavailable: latest ? null : "최근 세션에 한도 기록이 없습니다",
  };
}
