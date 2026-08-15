import { cn } from "@/lib/format";
import type { RunnerStatus, TaskStatus } from "../types";

const STATUS_STYLES: Record<TaskStatus, string> = {
  QUEUED: "bg-slate-600/30 text-slate-300 border-slate-500/40",
  RUNNING: "bg-blue-600/20 text-blue-300 border-blue-500/40",
  REVIEWING: "bg-purple-600/20 text-purple-300 border-purple-500/40",
  READY: "bg-emerald-600/20 text-emerald-300 border-emerald-500/40",
  WARNING: "bg-amber-600/20 text-amber-300 border-amber-500/40",
  FAILED: "bg-red-600/20 text-red-300 border-red-500/40",
  CANCELLED: "bg-zinc-600/20 text-zinc-400 border-zinc-500/40",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

const RUNNER_ICON: Record<RunnerStatus, string> = {
  PENDING: "⏳",
  RUNNING: "🔄",
  SUCCESS: "✅",
  FAILED: "❌",
  SKIPPED: "⏭",
  CANCELLED: "🚫",
};

export function RunnerStatusPill({ label, status }: { label: string; status: RunnerStatus }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[#c8d1db]">
      <span className="text-[#8291a3]">{label}</span>
      <span>{RUNNER_ICON[status]}</span>
      <span className="mono">{status}</span>
    </span>
  );
}
