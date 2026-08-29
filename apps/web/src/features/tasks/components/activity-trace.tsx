"use client";

import { cn } from "@/lib/format";
import type { LogEntry } from "../types";

/**
 * A seismograph for one Task: how much output the agent has produced over the
 * last minute, bucketed into three-second columns.
 *
 * This exists because the honest answer to "how far along is it" is that this
 * system does not know. A Step reports that it is RUNNING, never that it is
 * 37% done, so a bar sweeping smoothly to 100% would be an animation invented
 * by the UI — the kind of progress indicator that keeps claiming 90% while a
 * process is wedged.
 *
 * Log arrival is the one real signal of work in progress, so that is what is
 * drawn. A busy agent makes a dense trace; a stalled one flattens, which is
 * exactly the moment you want to notice and exactly what a fake percentage
 * would hide.
 */

const WINDOW_MS = 60_000;
const BUCKETS = 20;
const BUCKET_MS = WINDOW_MS / BUCKETS;

/** Silence past this reads as "possibly stuck" rather than "thinking". */
const QUIET_MS = 30_000;

export interface TraceState {
  buckets: number[];
  /** ms since the most recent log line, or null when there has never been one. */
  silentFor: number | null;
}

/**
 * Walks backwards from the newest entry and stops at the first one older than
 * the window, so the cost is the number of lines *in the last minute* rather
 * than the number of lines the Task has ever produced.
 *
 * That distinction matters because this recomputes every second while a Task
 * is live, and `logs` grows without bound — a long run accumulates thousands
 * of entries, of which this only ever draws the last sixty seconds' worth.
 * Log entries arrive in chronological order, which is what makes the early
 * exit safe.
 */
export function computeTrace(logs: LogEntry[], now: number): TraceState {
  const buckets = new Array<number>(BUCKETS).fill(0);
  let newest = 0;

  for (let i = logs.length - 1; i >= 0; i--) {
    const t = new Date(logs[i]!.timestamp).getTime();
    if (t > newest) newest = t;
    const age = now - t;
    // Older than the window — and so is everything before it.
    if (age >= WINDOW_MS) break;
    if (age < 0) continue;
    // Index 0 is the oldest column, so the trace scrolls left as time passes.
    const idx = BUCKETS - 1 - Math.floor(age / BUCKET_MS);
    if (idx >= 0 && idx < BUCKETS) buckets[idx] = (buckets[idx] ?? 0) + 1;
  }

  return { buckets, silentFor: newest > 0 ? now - newest : null };
}

export function ActivityTrace({
  logs,
  className,
  height = 16,
}: {
  logs: LogEntry[];
  className?: string;
  height?: number;
}) {
  // `Date.now()` read at render: the caller re-renders every second while its
  // Task is live (see `useNowTick`), which is what scrolls the window.
  const { buckets, silentFor } = computeTrace(logs, Date.now());
  const peak = Math.max(...buckets, 1);
  const quiet = silentFor !== null && silentFor > QUIET_MS;

  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex items-end gap-[2px]" style={{ height }} aria-hidden>
        {buckets.map((count, i) => (
          <span
            key={i}
            style={{
              height: count === 0 ? 2 : Math.max(3, Math.round((count / peak) * height)),
            }}
            className={cn(
              "w-[2px] rounded-sm transition-[height] duration-base",
              count === 0 ? "bg-fg/12" : quiet ? "bg-fg/25" : "bg-brand/70",
            )}
          />
        ))}
      </span>
      {quiet ? (
        <span className="shrink-0 text-xs text-fg-faint">
          {Math.floor((silentFor ?? 0) / 1000)}초째 출력 없음
        </span>
      ) : null}
    </span>
  );
}
