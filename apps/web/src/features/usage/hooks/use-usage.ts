"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UsageSnapshot } from "@ai-task-router/shared";
import { usageApi } from "../api/usage-api";

/**
 * How often the band re-reads the snapshot.
 *
 * Far slower than the Task poller's few seconds, and deliberately so: these
 * numbers only move when a CLI takes a turn, and the server caches them anyway.
 * A minute is fast enough that the panel is never meaningfully behind and slow
 * enough that an idle dashboard is not walking two transcript trees all day.
 */
const POLL_MS = 60_000;

export function useUsage() {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await usageApi.snapshot());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Same rule the Task poller follows: nothing runs while the tab is hidden,
    // and coming back refetches immediately rather than waiting out the
    // interval with a stale reading on screen.
    function start() {
      if (timerRef.current) return;
      timerRef.current = setInterval(() => void refresh(), POLL_MS);
    }
    function stop() {
      if (!timerRef.current) return;
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        void refresh();
        start();
      }
    }

    void refresh();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}
