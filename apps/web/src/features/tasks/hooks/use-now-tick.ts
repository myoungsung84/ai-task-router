"use client";

import { useEffect, useState } from "react";

/**
 * Forces a re-render every `intervalMs` while `active` is true — used so a
 * live Task's elapsed-duration display (`formatDuration`, which reads
 * `Date.now()`) keeps ticking even when no new log line has arrived to
 * trigger a re-render on its own. Not a progress bar — just keeps a real,
 * timestamp-derived number moving so an active card doesn't look frozen.
 */
export function useNowTick(active: boolean, intervalMs = 1000): number {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);

  return Date.now();
}
