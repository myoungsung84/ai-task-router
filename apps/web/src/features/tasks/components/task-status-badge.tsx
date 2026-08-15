import { cn } from "@/lib/format";
import { TASK_STATUS_LABEL } from "../workflow-labels";
import type { TaskStatus } from "../types";

const STATUS_STYLES: Record<TaskStatus, string> = {
  QUEUED: "bg-slate-600/30 text-slate-300 border-slate-500/40",
  RUNNING: "bg-blue-600/20 text-blue-300 border-blue-500/40",
  REVIEWING: "bg-purple-600/20 text-purple-300 border-purple-500/40",
  READY: "bg-emerald-600/20 text-emerald-300 border-emerald-500/40",
  WARNING: "bg-amber-600/20 text-amber-300 border-amber-500/40",
  FAILED: "bg-red-600/20 text-red-300 border-red-500/40",
  CANCELLED: "bg-zinc-600/20 text-zinc-400 border-zinc-500/40",
};

// Not color alone: every status also gets a distinct glyph.
const STATUS_ICON: Record<TaskStatus, string> = {
  QUEUED: "⏳",
  RUNNING: "▶",
  REVIEWING: "🔍",
  READY: "✓",
  WARNING: "⚠",
  FAILED: "✕",
  CANCELLED: "⏹",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const animated = status === "RUNNING" || status === "REVIEWING";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      <span aria-hidden className={cn(animated && "motion-safe:animate-pulse")}>
        {STATUS_ICON[status]}
      </span>
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}
