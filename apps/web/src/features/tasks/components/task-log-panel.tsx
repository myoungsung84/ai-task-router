"use client";

import { useEffect, useRef } from "react";
import { EmptyState } from "@/components/states";
import type { LogEntry, LogSource } from "../types";

const SOURCE_LABEL: Record<LogSource, string> = {
  system: "System",
  claude: "Claude",
  codex: "Codex",
};

/** `source` omitted (or "all") shows every log line, unfiltered, in the order they happened. */
export function TaskLogPanel({ logs, source }: { logs: LogEntry[]; source?: LogSource | "all" }) {
  const filtered = !source || source === "all" ? logs : logs.filter((l) => l.source === source);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  return (
    <div
      ref={scrollRef}
      className="mono h-80 overflow-y-auto rounded-lg border border-border bg-surface-sunken p-4 text-xs leading-relaxed"
    >
      {filtered.length === 0 ? (
        <EmptyState title="아직 로그가 없습니다" padding="sm" />
      ) : (
        filtered.map((log) => (
          <div
            key={log.id}
            className={
              (log.stream === "stderr" ? "text-danger" : "text-fg-secondary") +
              " whitespace-pre-wrap break-words"
            }
          >
            <span className="text-fg-faint">{new Date(log.timestamp).toLocaleTimeString()} </span>
            {!source || source === "all" ? (
              <span className="mr-1 text-fg-faint">[{SOURCE_LABEL[log.source]}]</span>
            ) : null}
            {log.text}
          </div>
        ))
      )}
    </div>
  );
}
