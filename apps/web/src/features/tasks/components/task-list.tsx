"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTaskList } from "../hooks/use-task-list";
import { tasksApi } from "../api/tasks-api";
import { StatusFilter, type MainFilter } from "./status-filter";
import { TaskSearchBar } from "./task-search-bar";
import { ActiveTaskRow, TaskListHeader, TaskRow } from "./task-row";
import { NewTaskModal } from "./new-task-modal";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useToast } from "@/components/toast";
import { projectName } from "@/lib/format";
import { statusGroupOf } from "../types";
import {
  ATTENTION_REASON_LABEL,
  attentionReasonOf,
  type AttentionReason,
} from "../workflow-labels";
import type { TaskListItem } from "../types";

const SECTION_LABEL: Record<"active" | "attention" | "done", string> = {
  active: "진행 중",
  attention: "확인 필요",
  done: "완료",
};

// Display order for the "확인 필요" section's reason breakdown — most
// actionable-by-the-user-right-now first.
const ATTENTION_REASON_ORDER: AttentionReason[] = [
  "REVIEW_NEEDS_FIX",
  "REVIEW_FAILED",
  "EXECUTION_FAILED",
];

/** "리뷰 수정 필요 2 · 실행 실패 1" — omits any reason with zero Tasks. `null` when nothing to break down (e.g. a lone Task, or reasons not yet derivable). */
function attentionBreakdownText(items: TaskListItem[]): string | null {
  const counts: Partial<Record<AttentionReason, number>> = {};
  for (const t of items) {
    const reason = attentionReasonOf(t);
    if (reason) counts[reason] = (counts[reason] ?? 0) + 1;
  }
  const parts = ATTENTION_REASON_ORDER.filter((r) => counts[r]).map(
    (r) => `${ATTENTION_REASON_LABEL[r]} ${counts[r]}`,
  );
  return parts.length > 1 ? parts.join(" · ") : null;
}

export function TaskList() {
  const { tasks, loading, error, refresh } = useTaskList();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<MainFilter>("all");
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<TaskListItem | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TaskListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  const counts: Record<MainFilter, number> = useMemo(() => {
    const c: Record<MainFilter, number> = { active: 0, attention: 0, done: 0, all: tasks.length };
    for (const t of tasks) c[statusGroupOf(t.status)] += 1;
    return c;
  }, [tasks]);

  /**
   * Rows always render in priority order (진행 중 → 확인 필요 → 완료). The
   * group headings on top of that only earn their space when they actually
   * separate something: with a single group present — the common case while
   * this workspace holds a handful of Tasks — a heading would just be a
   * label repeating what the status column already says, plus a band of
   * empty space above a one-row list.
   */
  const sections = useMemo(() => {
    const order: ("active" | "attention" | "done")[] = ["active", "attention", "done"];
    return order
      .map((key) => ({ key, items: filtered.filter((t) => statusGroupOf(t.status) === key) }))
      .filter((s) => s.items.length > 0);
  }, [filtered]);

  const showSectionLabels = sections.length > 1;

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
    try {
      await tasksApi.cancel(cancelTarget.id);
      showToast("success", `${cancelTarget.jobId} 작업을 중단했습니다.`);
      setCancelTarget(null);
      void refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setCancelBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await tasksApi.remove(deleteTarget.id);
      showToast("success", `${deleteTarget.jobId} 작업을 삭제했습니다.`);
      setDeleteTarget(null);
      void refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  const cancelIsQueued = cancelTarget?.status === "QUEUED";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-fg">작업</h1>
        {tasks.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <StatusFilter value={filter} onChange={setFilter} counts={counts} />
            <TaskSearchBar
              search={search}
              onSearchChange={setSearch}
              project={project}
              onProjectChange={setProject}
              projectOptions={projectOptions}
            />
          </div>
        ) : null}
      </div>

      {/*
        One bordered surface for the whole list — header row, group
        headings and rows all live inside it. That container is what keeps
        a single-Task workspace from reading as a half-finished screen: the
        list has a defined shape whether it holds one row or forty.
      */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {loading && tasks.length === 0 ? (
          <LoadingState label="작업 목록을 불러오는 중" padding="md" className="justify-center" />
        ) : error ? (
          <ErrorState
            message={`목록을 불러오지 못했습니다: ${error}`}
            onRetry={refresh}
            className="m-4"
          />
        ) : tasks.length === 0 ? (
          <EmptyState
            title="아직 등록된 작업이 없습니다"
            description="프로젝트와 지시 내용을 입력하면 Claude 또는 Codex가 실행합니다."
            action={
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewTaskOpen(true)}>
                새 작업
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="조건에 맞는 작업이 없습니다"
            description="검색어나 필터를 조정해 보세요."
          />
        ) : (
          <>
            <TaskListHeader />
            <div className="divide-y divide-border">
              {sections.map((section) => (
                <div key={section.key} className="divide-y divide-border">
                  {showSectionLabels ? (
                    <div className="flex items-center gap-2 bg-fg/[0.02] px-4 py-1.5 text-xs font-medium text-fg-muted">
                      {SECTION_LABEL[section.key]}
                      <span className="mono text-fg-faint">{section.items.length}</span>
                      {section.key === "attention" ? (
                        <span className="font-normal text-fg-faint">
                          {attentionBreakdownText(section.items)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {section.items.map((t) =>
                    section.key === "active" ? (
                      <ActiveTaskRow
                        key={t.id}
                        task={t}
                        onCancelClick={setCancelTarget}
                        onStartClick={onStartClick}
                        starting={startingIds.has(t.id)}
                      />
                    ) : (
                      <TaskRow key={t.id} task={t} onDeleteClick={setDeleteTarget} />
                    ),
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        title={cancelIsQueued ? "대기 작업 취소" : "실행 중단"}
        message={
          cancelTarget
            ? cancelIsQueued
              ? `${cancelTarget.jobId} "${cancelTarget.title}"을(를) 대기열에서 제거합니다. 아직 실행되지 않았습니다.`
              : `${cancelTarget.jobId} "${cancelTarget.title}"의 실행을 중단합니다. 진행 중인 프로세스가 종료됩니다.`
            : ""
        }
        confirmLabel={cancelIsQueued ? "대기 취소" : "실행 중단"}
        busy={cancelBusy}
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="작업 삭제"
        message={
          deleteTarget
            ? `${deleteTarget.jobId} "${deleteTarget.title}"을(를) 삭제합니다. 되돌릴 수 없습니다. Markdown 기록은 남습니다.`
            : ""
        }
        confirmLabel="삭제"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <NewTaskModal open={newTaskOpen} onClose={() => setNewTaskOpen(false)} />
    </div>
  );
}
