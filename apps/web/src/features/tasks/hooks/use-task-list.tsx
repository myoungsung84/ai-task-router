"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { tasksApi } from "../api/tasks-api";
import type { TaskListItem } from "../types";

/**
 * How often the Task list is re-fetched, in ms.
 *
 * Two speeds rather than one: while something is QUEUED/RUNNING/REVIEWING the
 * list is what drives the live bits of the UI (the AI team strip's characters,
 * a row's elapsed time), so it needs to feel immediate; once everything has
 * settled, nothing on screen can change except by someone creating a Task —
 * which refreshes explicitly anyway — so a fast poll would just be a request
 * every 3s, forever, for an unchanged payload.
 */
const POLL_ACTIVE_MS = 2000;
const POLL_IDLE_MS = 10000;

/** Statuses that mean "this can change on its own without anyone clicking". */
const LIVE_STATUSES = new Set(["QUEUED", "RUNNING", "REVIEWING"]);

interface TaskListValue {
  tasks: TaskListItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const TaskListContext = createContext<TaskListValue | null>(null);

/**
 * One poller for the whole app.
 *
 * Every screen that needs "all Tasks" reads it from here. Before this was a
 * provider each consumer ran its own `setInterval`, so the Task detail page
 * alone kept two independent 3s polls of the same endpoint alive (its own,
 * plus the list's), and Settings added a third — all fetching the identical
 * payload and all still running with the tab in the background.
 *
 * Polling is suspended entirely while the document is hidden and resumes with
 * an immediate fetch when it comes back, so a tab left open overnight costs
 * nothing and is never stale on return.
 */
export function TaskListProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read by the scheduler without making it a dependency — the loop must not
  // be torn down and rebuilt every time a poll returns new data.
  const hasLiveRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await tasksApi.list();
      setTasks(data);
      hasLiveRef.current = data.some((t) => LIVE_STATUSES.has(t.status));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    function clear() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    // setTimeout rather than setInterval: the delay is re-decided after every
    // poll, so the list speeds up the moment work starts and slows back down
    // when it finishes, without tearing down and recreating an interval.
    function schedule() {
      clear();
      if (cancelled || document.hidden) return;
      timerRef.current = setTimeout(
        async () => {
          await refresh();
          schedule();
        },
        hasLiveRef.current ? POLL_ACTIVE_MS : POLL_IDLE_MS,
      );
    }

    function onVisibility() {
      if (document.hidden) {
        clear();
      } else {
        void refresh().then(schedule);
      }
    }

    void refresh().then(schedule);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ tasks, loading, error, refresh }),
    [tasks, loading, error, refresh],
  );

  return <TaskListContext.Provider value={value}>{children}</TaskListContext.Provider>;
}

/**
 * The shared Task list. Throws rather than silently falling back to a private
 * poller, so a screen mounted outside the provider fails loudly in dev instead
 * of quietly reintroducing the duplicate-polling this replaced.
 */
export function useTaskList(): TaskListValue {
  const ctx = useContext(TaskListContext);
  if (!ctx) {
    throw new Error("useTaskList must be used inside <TaskListProvider>");
  }
  return ctx;
}
