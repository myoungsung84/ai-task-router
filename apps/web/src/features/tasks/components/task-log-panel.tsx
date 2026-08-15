"use client";

import { useEffect, useRef } from "react";
import { Card } from "@/components/card";
import type { LogEntry, LogSource } from "../types";

const SOURCE_LABEL: Record<LogSource, string> = {
  system: "System",
  claude: "Claude",
  codex: "Codex",
};

/** `source` omitted (or "all") shows every log line, unfiltered, in the order they happened. */
export function TaskLogPanel({
  logs,
  source,
  title,
}: {
  logs: LogEntry[];
  source?: LogSource | "all";
  title?: string;
}) {
  const filtered = !source || source === "all" ? logs : logs.filter((l) => l.source === source);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  const heading = title ?? `[${source && source !== "all" ? SOURCE_LABEL[source] : "전체"}]`;

  return (
    <Card title={heading} className="flex flex-col">
      <div
        ref={scrollRef}
        className="mono h-72 overflow-y-auto rounded-md bg-black/30 p-3 text-xs leading-relaxed"
      >
        {filtered.length === 0 ? (
          <p className="text-[#546274]">아직 로그가 없습니다.</p>
        ) : (
          filtered.map((log) => (
            <div
              key={log.id}
              className={
                (log.stream === "stderr" ? "text-red-400" : "text-[#c8d1db]") +
                " whitespace-pre-wrap break-words"
              }
            >
              <span className="text-[#546274]">
                {new Date(log.timestamp).toLocaleTimeString()}{" "}
              </span>
              {!source || source === "all" ? (
                <span className="mr-1 text-[#546274]">[{SOURCE_LABEL[log.source]}]</span>
              ) : null}
              {log.text}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
