"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscussionListItem } from "@ai-task-router/shared";
import { discussionsApi } from "../api/discussions-api";

/**
 * Every discussion, for the index and the tower.
 *
 * A single poll shared by both, for the reason the Task list has one: two
 * components asking the same endpoint on their own timers is two requests for
 * one answer, and they drift out of step with each other besides. This is
 * simpler than the Task provider because a discussion changes only when a
 * person or an agent writes to it — there is no local clock ticking — so one
 * slow interval is enough.
 */

const POLL_MS = 10000;

export function useDiscussions() {
  const [discussions, setDiscussions] = useState<DiscussionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setDiscussions(await discussionsApi.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!document.hidden) await load();
      if (cancelled) return;
      timer.current = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  return { discussions, loading, error, refresh: load };
}
