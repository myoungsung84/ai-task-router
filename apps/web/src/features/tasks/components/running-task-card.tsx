"use client";

import Link from "next/link";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { cn, formatDuration, projectName } from "@/lib/format";
import { TaskStatusBadge } from "./task-status-badge";
import { WorkflowTimeline } from "./workflow-timeline";
import { useTask } from "../hooks/use-task";
import type { TaskListItem } from "../types";

/**
 * Active cards get their own small SSE subscription (via useTask) purely
 * for the live log tail + fine-grained step updates — the dashboard's list
 * poll (useTaskList) already keeps membership/overall status current, so
 * this only adds a stream per *currently active* task, not per row.
 */
export function RunningTaskCard({
  task: listTask,
  onCancelClick,
}: {
  task: TaskListItem;
  onCancelClick: (task: TaskListItem) => void;
}) {
  const { task: live } = useTask(listTask.id);
  const task = live ?? listTask;
  const activeStep = task.workflow.steps.find((s) => s.status === "RUNNING");
  const cancellable = task.status === "RUNNING" || task.status === "REVIEWING";
  const recentLogs = live ? live.logs.filter((l) => l.source !== "system").slice(-2) : [];

  return (
    <Card
      className={cn(
        "border-blue-500/20",
        cancellable && "shadow-[0_0_0_1px_rgba(59,130,246,0.15)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="mono text-xs text-[#8291a3]">{task.jobId}</span>
            <TaskStatusBadge status={task.status} />
          </div>
          <Link
            href={`/tasks/${task.jobId}`}
            className="mt-1 block truncate text-sm font-semibold text-white hover:underline"
          >
            {task.title}
          </Link>
          <div className="mono mt-0.5 truncate text-xs text-[#8291a3]">
            {projectName(task.projectPath)}
            {task.branch ? ` · ${task.branch}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-xs text-[#8291a3]">
            {formatDuration(task.startedAt, task.completedAt)}
          </div>
          {cancellable ? (
            <Button variant="danger" className="mt-2" onClick={() => onCancelClick(listTask)}>
              중단
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <WorkflowTimeline workflow={task.workflow} compact />
      </div>

      {recentLogs.length > 0 ? (
        <div className="mt-2 space-y-0.5 border-t border-[#232c38] pt-2">
          {recentLogs.map((log) => (
            <p key={log.id} className="mono truncate text-xs text-[#8291a3]">
              &gt; {log.text}
            </p>
          ))}
        </div>
      ) : activeStep?.result?.summary ? (
        <p className="mt-2 line-clamp-2 text-xs text-[#8291a3]">{activeStep.result.summary}</p>
      ) : null}
    </Card>
  );
}
