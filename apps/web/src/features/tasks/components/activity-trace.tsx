"use client";

import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/format";
import type { AgentName, LogEntry } from "../types";

/** "45초째" / "3분째" — a stall measured in minutes should not read as 214 seconds. */
function formatSilence(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 90) return `${seconds}초째`;
  return `${Math.floor(seconds / 60)}분째`;
}

/**
 * A Task's output, drawn as the card's own background.
 *
 * This began as a 78px seismograph in the corner of the card, and the corner
 * was the problem: at that size it read as a small part bolted on, so no
 * amount of tuning its colour or motion stopped it looking like decoration.
 * Occupying the card instead makes the *card* the thing that reacts, which is
 * what "a Task that is working" should look like.
 *
 * What it draws is unchanged in principle: log arrival, bucketed over the last
 * minute. This system never reports how far along a Step is — RUNNING is all a
 * Step says — so a bar sweeping to 100% would be a fiction the UI invented.
 * Bar heights here are counts of lines that actually arrived.
 *
 * The one exception is deliberate and is explained on `buffering` below.
 */

const WINDOW_MS = 60_000;
/**
 * One bucket per second of the window, which is also the rate the card
 * re-renders at (`useNowTick`) — going finer would draw a resolution the
 * screen never actually refreshes at.
 *
 * It doubles as the visual density, and at 60 the two wants agree: denser bars
 * than the 48 this started with, and a bucket whose meaning is legible.
 */
const BUCKETS = 60;
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

/**
 * Bars are tinted by the Agent that owns the running Step, so a two-Step Task
 * changes colour under you at the handoff. Written as whole class strings
 * because Tailwind cannot see an interpolated one.
 *
 * The alpha is written as an arbitrary value rather than `from-agent-claude/30`
 * because Tailwind's slash shorthand only accepts steps that exist on its
 * opacity scale — 5, 10, 20, 25, 30... — and silently emits *no class at all*
 * for anything else. An earlier version used /45 and /14, so the gradient lost
 * its start colour entirely and the equalizer faded out for reasons no amount
 * of tuning the number could fix.
 *
 * The gradient dies to transparent well before the top of each bar: this sits
 * behind the card's title and log line, and a flat fill at a legible strength
 * would take the text down with it.
 */
const EQ_TINT: Record<AgentName, string> = {
  claude: "from-[rgb(var(--agent-claude)/0.30)] via-[rgb(var(--agent-claude)/0.10)] to-transparent",
  codex: "from-[rgb(var(--agent-codex)/0.30)] via-[rgb(var(--agent-codex)/0.10)] to-transparent",
};

/** A stalled run drains of colour — the bars stay, the life goes out of them. */
const EQ_QUIET = "from-[rgb(var(--fg)/0.16)] via-[rgb(var(--fg)/0.05)] to-transparent";

/** How long a layer takes to fade in or out. */
const FADE_MS = 520;

/**
 * The bars for one Agent. Several of these are stacked during a handoff, which
 * is what lets one colour leave while the next arrives instead of the fill
 * simply switching — a gradient is a `background-image`, and those do not
 * transition between values, so a cross-fade needs two real layers.
 */
function EqualizerLayer({
  logs,
  agent,
  running,
  visible,
}: {
  logs: LogEntry[];
  agent: AgentName;
  running: boolean;
  visible: boolean;
}) {
  // `Date.now()` read at render: the caller re-renders every second while its
  // Task is live (see `useNowTick`), which is what scrolls the window.
  const now = Date.now();
  const { buckets, silentFor } = computeTrace(logs, now);
  const peak = Math.max(...buckets, 1);
  const quiet = silentFor !== null && silentFor > QUIET_MS;

  /**
   * Running, with nothing in the window to draw.
   *
   * This is the *normal* state for a whole Claude run, not a fault, and it is
   * not a rare corner either — measured on T-26, a 249.5s analyze produced its
   * first line at 248.7s and then delivered all 69 of them on a single
   * timestamp. For the agent this app runs by default it is effectively the
   * entire visible life of a Task.
   *
   * The test used to be `silentFor === null` — never spoken at all — and that
   * turned out to be far too narrow for the other agent. On T-42, Codex opened
   * its mouth at 0.8s and so left this state permanently after one line, then
   * went 161 seconds without another: of 48 buckets, exactly one was filled,
   * and the other 47 sat at the floor height. The bars appeared and vanished
   * with each burst, which is honest and completely unreadable.
   *
   * So the question is not "has it ever spoken" but "is there anything to
   * draw right now". `quiet` is excluded deliberately — past 90s of silence
   * the run may genuinely be wedged, and a lively swell over a stalled process
   * is exactly the lie the stall badge exists to prevent.
   *
   * This is the one place a rhythm is invented rather than measured, and it is
   * honest precisely because there is no measurement to contradict: zero lines
   * are in the window, and the bars say so by carrying no data — a travelling
   * swell meaning "the channel is open and empty", never a height claiming a
   * quantity. The moment a real line lands the sweep stops and the same bars
   * switch to counts.
   */
  const empty = buckets.every((count) => count === 0);
  const buffering = running && empty && !quiet;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[64%] items-end gap-[2px] overflow-hidden"
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
    >
      {buckets.map((count, i) => (
        <span
          key={i}
          className={cn(
            "h-full flex-1 origin-bottom rounded-t-[1px] bg-gradient-to-t",
            buffering && "eq-bar",
            quiet ? EQ_QUIET : EQ_TINT[agent],
          )}
          style={
            buffering
              ? /*
                 * Negative, and spaced so the phase wraps three times across
                 * the card: 1800ms × 3 / 60 bars = 90ms.
                 *
                 * Three crests means several parts of the row are always in
                 * motion instead of one swell passing through. Negative starts
                 * every bar mid-cycle on the first frame — with the positive
                 * delays this used, the far end of the row stood still for up
                 * to two seconds after a card appeared.
                 */
                { animationDelay: `${-(i * 90)}ms` }
              : {
                  transform: `scaleY(${count === 0 ? 0.015 : Math.max(0.06, count / peak)})`,
                  transition: "transform 400ms ease-out",
                }
          }
        />
      ))}
    </span>
  );
}

/**
 * The card's equalizer, and the only thing the card itself renders.
 *
 * Two fades live here, and both exist because the previous version simply
 * stopped existing at the moment it mattered.
 *
 * **Ending.** The bars used to be unmounted the instant the Task left RUNNING,
 * so a run ended by the colour being switched off. It now fades, and it has
 * room to: the card's own exit does not begin until the list's next poll
 * reclassifies the Task, and this fade fits inside that gap.
 *
 * **Handing over.** On a two-Step Task the implementer's colour leaves and the
 * reviewer's arrives, which is the moment the card exists to show. A gradient
 * is a `background-image` and cannot transition between two values, so the
 * outgoing Agent keeps its own layer until it has finished fading and is then
 * dropped.
 */
export function ActivityEqualizer({
  logs,
  agent,
  running = false,
}: {
  logs: LogEntry[];
  /** Whoever owns the current Step, for the tint. */
  agent: AgentName;
  /**
   * Whether the run is executing right now. Without it a *finished* Task that
   * never logged would animate forever — it is not waiting for output, it is
   * over.
   */
  running?: boolean;
}) {
  const [layers, setLayers] = useState<{ key: number; agent: AgentName }[]>([{ key: 0, agent }]);
  const prevAgent = useRef(agent);

  useEffect(() => {
    if (prevAgent.current === agent) return;
    prevAgent.current = agent;
    setLayers((current) => [
      ...current,
      { key: (current[current.length - 1]?.key ?? 0) + 1, agent },
    ]);
    // The outgoing layer is kept only as long as its fade, then dropped so a
    // long Task cannot accumulate one dead layer per handoff.
    const drop = setTimeout(() => setLayers((current) => current.slice(-1)), FADE_MS);
    return () => clearTimeout(drop);
  }, [agent]);

  return (
    <>
      {layers.map((layer, i) => (
        <EqualizerLayer
          key={layer.key}
          logs={logs}
          agent={layer.agent}
          running={running}
          // Only the newest layer is the current Agent; anything behind it is
          // on its way out. Everything goes when the run stops.
          visible={running && i === layers.length - 1}
        />
      ))}
    </>
  );
}

/**
 * The stall badge, kept as text rather than folded into the bars above.
 *
 * It earned the separation in practice: a Codex review was orphaned by a
 * server restart and sat silent for minutes, and the trace *had* detected it —
 * but stated it quietly enough that nobody noticed until the screen was looked
 * at deliberately. Draining the bars of colour is a mood; this is a sentence.
 */
export function StallBadge({ logs, className }: { logs: LogEntry[]; className?: string }) {
  const { silentFor } = computeTrace(logs, Date.now());
  if (silentFor === null || silentFor <= QUIET_MS) return null;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-xs font-medium text-warning",
        className,
      )}
    >
      <TriangleAlert className="h-3 w-3" aria-hidden />
      {formatSilence(silentFor)} 출력 없음
    </span>
  );
}

/*
 * There was briefly a "출력 대기 21초째" counter here. It was removed: the rail
 * above it already prints the Step's elapsed time, so a second clock two lines
 * below restated a number the card had, in different words. The card's job
 * during a buffering run is to show what the agent is doing, not to time it
 * twice — that is what the log line and the bars behind it are for.
 */
