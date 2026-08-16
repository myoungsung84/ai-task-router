import { Ban, CheckCircle2, Circle, Loader2, Search, XCircle } from "lucide-react";
import { Badge, type Tone } from "@/components/badge";
import { TASK_STATUS_LABEL } from "../workflow-labels";
import type { TaskStatus } from "../types";

const STATUS_TONE: Record<TaskStatus, Tone> = {
  QUEUED: "neutral",
  RUNNING: "info",
  REVIEWING: "reviewing",
  READY: "success",
  WARNING: "warning",
  FAILED: "danger",
  CANCELLED: "neutral",
};

// Not color alone: every status also gets a distinct glyph.
const STATUS_ICON = {
  QUEUED: <Circle className="h-3 w-3" />,
  RUNNING: <Loader2 className="h-3 w-3 animate-spin" />,
  REVIEWING: <Search className="h-3 w-3" />,
  READY: <CheckCircle2 className="h-3 w-3" />,
  WARNING: <span className="text-[13px] leading-none">⚠</span>,
  FAILED: <XCircle className="h-3 w-3" />,
  CANCELLED: <Ban className="h-3 w-3" />,
} satisfies Record<TaskStatus, React.ReactNode>;

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <Badge
      tone={STATUS_TONE[status]}
      icon={STATUS_ICON[status]}
      pulse={status === "REVIEWING"}
      className={className}
    >
      {TASK_STATUS_LABEL[status]}
    </Badge>
  );
}
