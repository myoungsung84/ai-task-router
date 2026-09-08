import type { AgentUsage, UsageSnapshot } from "@ai-task-router/shared";
import { claudeAccountKey, collectClaudeUsage } from "./claude-usage";
import { collectCodexUsage } from "./codex-usage";

/**
 * How long a computed snapshot is reused.
 *
 * Collecting means walking both CLIs' transcript directories, so an uncached
 * read is cheap but not free. The underlying numbers move at most once per CLI
 * turn, and the panel polls on a timer, so a few seconds of staleness costs the
 * display nothing while keeping a dashboard left open overnight from re-reading
 * every transcript on every tick.
 */
const CACHE_MS = 60_000;

let cached: { at: number; account: string; snapshot: UsageSnapshot } | null = null;
let inFlight: Promise<UsageSnapshot> | null = null;

async function collect(): Promise<UsageSnapshot> {
  const [claude, codex] = await Promise.all([collectClaudeUsage(), collectCodexUsage()]);
  return { claude: verifiedUsage(claude), codex: verifiedUsage(codex) };
}

export function verifiedUsage(usage: AgentUsage): AgentUsage {
  if (usage.accountMatch === "VERIFIED") return usage;
  if (usage.agent === "codex" && usage.accountMatch === "UNVERIFIABLE") {
    return { ...usage, account: null };
  }
  return {
    ...usage,
    // Codex 요금제도 계정이 확인되지 않은 세션 기록에서 가져온 값이다.
    account:
      usage.agent === "codex" && usage.account ? { ...usage.account, plan: null } : usage.account,
    primary: null,
    secondary: null,
    observedAt: null,
    unavailable:
      usage.accountMatch === "MISMATCHED"
        ? "계정 사용량 미확인 · 다른 계정의 기록입니다"
        : "계정 사용량 미확인 · 기록의 계정을 확인할 수 없습니다",
  };
}

export async function getUsageSnapshot(): Promise<UsageSnapshot> {
  // Keyed on the account, not just on age: signing in as someone else used to
  // keep serving the previous account's row until the timer happened to
  // expire. A few seconds of staleness is fine; a few seconds of the wrong
  // account is not the same thing.
  const account = claudeAccountKey();
  if (cached && cached.account === account && Date.now() - cached.at < CACHE_MS) {
    return cached.snapshot;
  }
  // Two dashboards (or a tab reopened mid-scan) must not each start their own
  // directory walk — the second one waits on the first rather than duplicating
  // it.
  if (inFlight) return inFlight;

  inFlight = collect()
    .then((snapshot) => {
      cached = { at: Date.now(), account, snapshot };
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
