"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/format";
import { TaskLogPanel } from "./task-log-panel";
import type { LogEntry, LogSource } from "../types";

const SOURCE_LABEL: Record<LogSource, string> = {
  system: "System",
  claude: "Claude",
  codex: "Codex",
};

/**
 * "실행 과정과 주요 활동" — a single chronological feed by default (전체),
 * with chips to narrow to one source. Replaces stacking three separate
 * per-source panels, which scattered a single Task's timeline across three
 * scroll areas.
 */
export function TaskActivityLog({ logs }: { logs: LogEntry[] }) {
  const present = useMemo<LogSource[]>(() => {
    const seen = new Set(logs.map((l) => l.source));
    return (["claude", "codex", "system"] as LogSource[]).filter((s) => seen.has(s));
  }, [logs]);

  const [filter, setFilter] = useState<LogSource | "all">("all");

  return (
    <div className="space-y-3">
      <div className="inline-flex flex-wrap rounded-lg border border-[#232c38] bg-[#0e131a] p-1">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            filter === "all" ? "bg-white/10 text-white" : "text-[#8291a3] hover:text-white",
          )}
        >
          전체
        </button>
        {present.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === s ? "bg-white/10 text-white" : "text-[#8291a3] hover:text-white",
            )}
          >
            {SOURCE_LABEL[s]}
          </button>
        ))}
      </div>
      <TaskLogPanel logs={logs} source={filter} />
    </div>
  );
}
