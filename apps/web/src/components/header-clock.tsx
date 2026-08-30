"use client";

import { useEffect, useState } from "react";

/**
 * The wall clock in the app header.
 *
 * Everything else on this screen reports a *relative* time — "22s", "3분 전",
 * "출력 대기 21초째" — which answers "how long" but never "when". Reading a run
 * that started twenty minutes ago against the actual time of day is what the
 * header was missing, and it costs one line that is always true.
 *
 * Rendered only after mount, and null on the server, because the markup
 * Next.js generates at build time would carry the build machine's second and
 * hydrate into a mismatch on every load. The reserved width below keeps that
 * first paint from shifting the cluster beside it.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Every field is two digits, including the hour.
 *
 * That is the whole reason this is hand-formatted rather than left to
 * `toLocaleTimeString`: a clock that renders "9시" for one hour of the day and
 * "10시" for the next changes width mid-sentence, and the header nods sideways
 * every time it does. Two digits and `tabular-nums` together mean the string
 * occupies exactly the same box on every tick.
 */
function parts(d: Date): { date: string; time: string } {
  return {
    date: d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", weekday: "short" }),
    time: `${pad(d.getHours())}시 ${pad(d.getMinutes())}분 ${pad(d.getSeconds())}초`,
  };
}

export function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const shown = now ? parts(now) : null;

  return (
    <span
      className="hidden items-center justify-end gap-2 text-xs tabular-nums sm:flex"
      // Held even while empty so the header does not reflow on hydration, and
      // fixed rather than minimum so a wider weekday cannot nudge it either.
      style={{ width: 186 }}
      // The time is decoration for a screen reader working through a header —
      // it is announced on every tick and never actionable.
      aria-hidden
    >
      {shown ? (
        <>
          <span className="text-fg-faint">{shown.date}</span>
          <span className="mono font-medium text-fg-muted">{shown.time}</span>
        </>
      ) : null}
    </span>
  );
}
