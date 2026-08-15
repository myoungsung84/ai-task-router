"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tasksApi } from "../api/tasks-api";
import type { TaskListItem } from "../types";

const POLL_INTERVAL_MS = 3000;

/**
 * Simple polling list — no SSE fan-out here on purpose. The list view only
 * needs "roughly current" status; per-task detail pages use SSE for true
 * real-time logs.
 */
export function useTaskList() {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await tasksApi.list();
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    timerRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  return { tasks, loading, error, refresh };
}
