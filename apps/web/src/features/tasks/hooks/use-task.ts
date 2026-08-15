"use client";

import { useEffect, useRef, useState } from "react";
import { tasksApi } from "../api/tasks-api";
import type { Task, TaskEvent } from "../types";

/**
 * Detail-page hook: does a quick existence check (GET) before opening the
 * SSE stream, so a deleted/invalid id resolves to `notFound` instead of
 * leaving the caller stuck on "불러오는 중..." forever — EventSource itself
 * has no way to surface an HTTP status code, it just retries silently.
 * Once confirmed to exist, the SSE stream's first event is always a full
 * task snapshot (including logs collected so far), so this still works
 * correctly right after a page refresh.
 */
export function useTask(id: string) {
  const [task, setTask] = useState<Task | null>(null);
  const [connected, setConnected] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTask(null);
    setNotFound(false);
    setError(null);

    void tasksApi
      .get(id)
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        // The server's 404 body is the only realistic case here — treat any
        // failed existence check as "not found" for this id.
        setNotFound(true);
        setError(message);
        throw err;
      })
      .then(() => {
        if (cancelled) return;

        const es = new EventSource(tasksApi.eventsUrl(id));
        esRef.current = es;

        es.onopen = () => setConnected(true);
        es.onerror = () => setConnected(false);

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
              prev ? { ...prev, status: parsed.status, workflow: parsed.workflow } : prev,
            );
            // Status changes (error/timestamps/gitInfo) need the authoritative
            // object — a light refetch keeps those fields in sync.
            void tasksApi
              .get(id)
              .then((fresh) => setTask((prev) => (prev ? { ...fresh, logs: prev.logs } : fresh)))
              .catch(() => {});
          }
        };
      })
      .catch(() => {
        // already handled above
      });

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [id]);

  return { task, connected, notFound, error, setError };
}
