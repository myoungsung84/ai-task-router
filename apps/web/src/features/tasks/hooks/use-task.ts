"use client";

import { useEffect, useRef, useState } from "react";
import { tasksApi } from "../api/tasks-api";
import type { Task, TaskEvent } from "../types";

/**
 * Detail-page hook: the SSE stream's first event is always a full task
 * snapshot (including logs collected so far), so this works correctly even
 * right after a page refresh — no separate initial GET needed.
 */
export function useTask(id: string) {
  const [task, setTask] = useState<Task | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setTask(null);
    setError(null);

    const es = new EventSource(tasksApi.eventsUrl(id));
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onerror = () => {
      setConnected(false);
    };

    es.onmessage = (ev) => {
      let parsed: TaskEvent;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (parsed.type === "task") {
        setTask(parsed.task);
      } else if (parsed.type === "log") {
        setTask((prev) => (prev ? { ...prev, logs: [...prev.logs, parsed.log] } : prev));
      } else if (parsed.type === "status") {
        setTask((prev) =>
          prev
            ? {
                ...prev,
                status: parsed.status,
                claudeStatus: parsed.claudeStatus,
                codexStatus: parsed.codexStatus,
              }
            : prev,
        );
        // Status changes (claudeResult/codexReviewResult/error/timestamps) need
        // the authoritative object — a light refetch keeps those fields in sync.
        void tasksApi
          .get(id)
          .then((fresh) => setTask((prev) => (prev ? { ...fresh, logs: prev.logs } : fresh)))
          .catch(() => {});
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [id]);

  return { task, connected, error, setError };
}
