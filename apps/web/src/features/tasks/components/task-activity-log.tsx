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
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium transition-colors duration-fast",
            filter === "all" ? "bg-fg/10 text-fg" : "bg-fg/[0.04] text-fg-muted hover:text-fg",
          )}
        >
          전체
        </button>
        {present.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs font-medium transition-colors duration-fast",
              filter === s ? "bg-fg/10 text-fg" : "bg-fg/[0.04] text-fg-muted hover:text-fg",
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
