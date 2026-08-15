"use client";

import { useMemo, useState } from "react";
import { useTaskList } from "../hooks/use-task-list";
import { tasksApi } from "../api/tasks-api";
import { StatusSummary } from "./status-summary";
import { StatusFilter, type MainFilter } from "./status-filter";
import { TaskSearchBar } from "./task-search-bar";
import { RunningTaskCard } from "./running-task-card";
import { TaskRow } from "./task-row";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card } from "@/components/card";
import { useToast } from "@/components/toast";
import { projectName } from "@/lib/format";
import { statusGroupOf } from "../types";
import type { TaskListItem } from "../types";

export function TaskList() {
  const { tasks, loading, error, refresh } = useTaskList();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<MainFilter>("all");
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");

  const [cancelTarget, setCancelTarget] = useState<TaskListItem | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TaskListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [startingIds, setStartingIds] = useState<Set<string>>(new Set());

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

  async function onStartClick(task: TaskListItem) {
    setStartingIds((prev) => new Set(prev).add(task.id));
    try {
      await tasksApi.start(task.id);
      void refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setStartingIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      await tasksApi.cancel(cancelTarget.id);
      showToast("success", `${cancelTarget.jobId} 작업을 취소했습니다.`);
      setCancelTarget(null);
      void refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCancelError(message);
      showToast("error", message);
    } finally {
      setCancelBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await tasksApi.remove(deleteTarget.id);
      showToast("success", `${deleteTarget.jobId} 작업을 삭제했습니다.`);
      setDeleteTarget(null);
      void refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDeleteError(message);
      showToast("error", message);
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading && tasks.length === 0) {
    return <p className="text-sm text-[#8291a3]">불러오는 중...</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400">목록을 불러오지 못했습니다: {error}</p>;
  }

  const cancelIsQueued = cancelTarget?.status === "QUEUED";

  return (
    <div className="space-y-5">
      <StatusSummary tasks={tasks} />

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
                아직 생성된 Task가 없습니다. 우측 상단의{" "}
                <span className="text-white">+ New Task</span> 버튼으로 시작하세요.
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
                <RunningTaskCard
                  key={t.id}
                  task={t}
                  onCancelClick={setCancelTarget}
                  onStartClick={onStartClick}
                  starting={startingIds.has(t.id)}
                />
              ))}
            </div>
          ) : null}
          {otherItems.length > 0 ? (
            <div className="space-y-2">
              {otherItems.map((t) => (
                <TaskRow key={t.id} task={t} onDeleteClick={setDeleteTarget} />
              ))}
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        title={cancelIsQueued ? "Task 취소" : "작업 중단"}
        message={
          cancelTarget
            ? cancelIsQueued
              ? `${cancelTarget.jobId} "${cancelTarget.title}" 작업을 취소할까요? 아직 시작되지 않았습니다.`
              : `${cancelTarget.jobId} "${cancelTarget.title}" 작업을 중단할까요? 진행 중인 프로세스가 종료됩니다.`
            : ""
        }
        confirmLabel={cancelIsQueued ? "작업 취소" : "작업 중단"}
        busy={cancelBusy}
        onConfirm={confirmCancel}
        onCancel={() => {
          setCancelTarget(null);
          setCancelError(null);
        }}
      />
      {cancelError ? <p className="text-sm text-red-400">{cancelError}</p> : null}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Task 삭제"
        message={
          deleteTarget
            ? `${deleteTarget.jobId} "${deleteTarget.title}" 작업을 삭제할까요? 이 작업은 되돌릴 수 없습니다. (Markdown 기록은 남습니다.)`
            : ""
        }
        confirmLabel="삭제"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />
      {deleteError ? <p className="text-sm text-red-400">{deleteError}</p> : null}
    </div>
  );
}
