import type { UsageSnapshot } from "@ai-task-router/shared";
import { collectClaudeUsage } from "./claude-usage";
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
const CACHE_MS = 15_000;

let cached: { at: number; snapshot: UsageSnapshot } | null = null;
let inFlight: Promise<UsageSnapshot> | null = null;

async function collect(): Promise<UsageSnapshot> {
  const [claude, codex] = await Promise.all([collectClaudeUsage(), collectCodexUsage()]);
  return { claude, codex };
}

export async function getUsageSnapshot(): Promise<UsageSnapshot> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.snapshot;
  // Two dashboards (or a tab reopened mid-scan) must not each start their own
  // directory walk — the second one waits on the first rather than duplicating
  // it.
  if (inFlight) return inFlight;

  inFlight = collect()
    .then((snapshot) => {
      cached = { at: Date.now(), snapshot };
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
