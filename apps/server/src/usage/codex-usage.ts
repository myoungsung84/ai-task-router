import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentUsage, UsageWindow } from "@ai-task-router/shared";
import { config } from "../config";
import { forEachJsonLine } from "./jsonl";
import { isToday, startOfTodayMs } from "./kst";
import { readCodexAccount } from "./codex-account";
const SESSIONS_DIR = path.join(
  process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
  "sessions",
);

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

function toWindow(
  value: { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null } | null,
): UsageWindow | null {
  if (!value) return null;
  const expired = value.resetsAt !== null && value.resetsAt * 1000 <= Date.now();
  const usedPercent = expired ? null : value.usedPercent;
  return {
    usedPercent,
    remainingPercent: usedPercent === null ? null : 100 - usedPercent,
    windowMinutes: value.windowDurationMins,
    resetsAt: value.resetsAt === null ? null : new Date(value.resetsAt * 1000).toISOString(),
    expired,
  };
}

export async function collectCodexUsage(): Promise<AgentUsage> {
  const todayTokens = await readTodayTokens(listRollouts());
  const base: AgentUsage = {
    agent: "codex",
    account: null,
    accountMatch: "UNVERIFIABLE",
    primary: null,
    secondary: null,
    todayTokens,
    todayTokensScope: "LOCAL_ALL_SESSIONS",
    observedAt: null,
    unavailable: "Codex CLI 한도 조회 실패 · 로그인 상태를 확인하세요",
  };
  try {
    const { account, limits } = await readCodexAccount();
    const buckets = limits.rateLimitsByLimitId ?? {};
    const main = buckets.codex ?? limits.rateLimits;
    const observedAt = new Date().toISOString();
    return {
      ...base,
      accountMatch: "VERIFIED",
      unavailable: null,
      observedAt,
      account: {
        email: config.usageShowAccount ? account.email : null,
        plan: account.planType === "prolite" ? "Pro Lite" : account.planType,
        organization: null,
      },
      primary: toWindow(main.primary),
      secondary: toWindow(main.secondary),
      additionalLimits: Object.entries(buckets)
        .filter(
          ([key, value]) => key !== (main.limitId ?? "codex") && (value.primary || value.secondary),
        )
        .map(([key, value]) => ({
          label: value.limitName ?? key,
          primary: toWindow(value.primary),
          secondary: toWindow(value.secondary),
          observedAt,
        })),
    };
  } catch {
    return base;
  }
}
