"use client";

import { useEffect, useRef } from "react";
import { Card } from "@/components/card";
import type { LogEntry, LogSource } from "../types";

const SOURCE_LABEL: Record<LogSource, string> = {
  system: "System",
  claude: "Claude",
  codex: "Codex",
};

export function TaskLogPanel({ logs, source }: { logs: LogEntry[]; source: LogSource }) {
  const filtered = logs.filter((l) => l.source === source);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  return (
    <Card title={`[${SOURCE_LABEL[source]}]`} className="flex flex-col">
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
              {log.text}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
