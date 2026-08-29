"use client";

import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/format";
import type { LogEntry } from "../types";

/** "45초째" / "3분째" — a stall measured in minutes should not read as 214 seconds. */
function formatSilence(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 90) return `${seconds}초째`;
  return `${Math.floor(seconds / 60)}분째`;
}

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

/**
 * Silence past this reads as "possibly stuck" — but only once the run has
 * proved it streams at all (see `TraceState.silentFor`).
 *
 * Both numbers come from measured runs rather than taste. A Codex review
 * streamed 282 lines steadily across 2m42s, then was orphaned by a server
 * restart and went silent for over 200s — the case worth flagging. A Claude
 * analyze, meanwhile, emitted its first line at 54s of a 55s run: it buffers
 * everything and delivers at the end, so it is silent for essentially its
 * whole duration while working perfectly.
 *
 * A flat 30s threshold therefore warned on every healthy Claude run. Ninety
 * seconds sits well clear of normal streaming gaps and well under a real
 * stall, and the "has it ever spoken" gate below is what keeps a buffering
 * agent from tripping it at all.
 */
const QUIET_MS = 90_000;

export interface TraceState {
  buckets: number[];
  /**
   * ms since the most recent log line, or null when the run has never produced
   * one.
   *
   * The null case is load-bearing: an agent that has said nothing yet is not
   * stalled, it is buffering, and Claude buffers its entire run. Only a stream
   * that started and then stopped is evidence of a problem.
   */
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
    const log = logs[i]!;
    // The router's own commentary ("Claude 구현 시작.") is not the agent
    // working; counting it would keep the trace alive through exactly the
    // silence it exists to reveal.
    if (log.source === "system") continue;

    const t = new Date(log.timestamp).getTime();
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
      {/*
        A stalled run is the one thing this component exists to catch, so it
        says so in warning tone rather than as another grey caption. It earned
        the promotion in practice: a Codex review was orphaned by a server
        restart and sat silent for minutes, and the trace *had* detected it —
        but stated it quietly enough that nobody noticed until the screen was
        looked at deliberately.
      */}
      {quiet ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-xs font-medium text-warning">
          <TriangleAlert className="h-3 w-3" aria-hidden />
          {formatSilence(silentFor ?? 0)} 출력 없음
        </span>
      ) : null}
    </span>
  );
}
