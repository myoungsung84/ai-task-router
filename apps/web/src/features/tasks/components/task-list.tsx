"use client";

import { useMemo, useState } from "react";
import { useTaskList } from "../hooks/use-task-list";
import { tasksApi } from "../api/tasks-api";
import { StatusSummary } from "./status-summary";
import { StatusFilter, type MainFilter } from "./status-filter";
import { TaskSearchBar } from "./task-search-bar";
import { RunningTaskCard } from "./running-task-card";
import { TaskRow } from "./task-row";
import { NewTaskModal } from "./new-task-modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { projectName } from "@/lib/format";
import { statusGroupOf } from "../types";
import type { TaskListItem } from "../types";

export function TaskList() {
  const { tasks, loading, error, refresh } = useTaskList();
  const [filter, setFilter] = useState<MainFilter>("active");
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TaskListItem | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const projectOptions = useMemo(
    () => Array.from(new Set(tasks.map((t) => projectName(t.projectPath)))).sort(),
    [tasks],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filter !== "all" && statusGroupOf(t.status) !== filter) return false;
      if (project && projectName(t.projectPath) !== project) return false;
      if (!q) return true;
      return (
        t.jobId.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        projectName(t.projectPath).toLowerCase().includes(q) ||
        (t.branch ?? "").toLowerCase().includes(q)
      );
    });
  }, [tasks, filter, project, search]);

  // Active (QUEUED/RUNNING/REVIEWING) items are always shown as cards, no
  // matter which top-level filter narrowed the list down to them — a
  // running Task should stand out everywhere it appears, not just under
  // the "작업 중" tab.
  const activeItems = filtered.filter((t) => statusGroupOf(t.status) === "active");
  const otherItems = filtered.filter((t) => statusGroupOf(t.status) !== "active");

  const counts: Record<MainFilter, number> = useMemo(() => {
    const c: Record<MainFilter, number> = { active: 0, attention: 0, done: 0, all: tasks.length };
    for (const t of tasks) {
      const g = statusGroupOf(t.status);
      c[g] += 1;
    }
    return c;
  }, [tasks]);

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      await tasksApi.cancel(cancelTarget.id);
      setCancelTarget(null);
      void refresh();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelBusy(false);
    }
  }

  if (loading && tasks.length === 0) {
    return <p className="text-sm text-[#8291a3]">불러오는 중...</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400">목록을 불러오지 못했습니다: {error}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <StatusSummary tasks={tasks} />
        <Button onClick={() => setNewTaskOpen(true)}>+ New Task</Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <StatusFilter value={filter} onChange={setFilter} counts={counts} />
        <div className="sm:w-[28rem]">
          <TaskSearchBar
            search={search}
            onSearchChange={setSearch}
            project={project}
            onProjectChange={setProject}
            projectOptions={projectOptions}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-[#8291a3]">
            {tasks.length === 0 ? (
              <>
                아직 생성된 Task가 없습니다. <span className="text-white">+ New Task</span>로
                시작하세요.
              </>
            ) : (
              "조건에 맞는 Task가 없습니다."
            )}
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {activeItems.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {activeItems.map((t) => (
                <RunningTaskCard key={t.id} task={t} onCancelClick={setCancelTarget} />
              ))}
            </div>
          ) : null}
          {otherItems.length > 0 ? (
            <div className="space-y-2">
              {otherItems.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </div>
          ) : null}
        </div>
      )}

      <NewTaskModal open={newTaskOpen} onClose={() => setNewTaskOpen(false)} />

      <ConfirmDialog
        open={!!cancelTarget}
        title="작업 중단"
        message={cancelTarget ? `${cancelTarget.jobId} 작업을 중단할까요?` : ""}
        confirmLabel="작업 중단"
        busy={cancelBusy}
        onConfirm={confirmCancel}
        onCancel={() => {
          setCancelTarget(null);
          setCancelError(null);
        }}
      />
      {cancelError ? <p className="text-sm text-red-400">{cancelError}</p> : null}
    </div>
  );
}
