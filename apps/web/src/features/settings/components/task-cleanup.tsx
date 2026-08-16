"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTaskList } from "@/features/tasks/hooks/use-task-list";
import { tasksApi } from "@/features/tasks/api/tasks-api";
import { statusGroupOf } from "@/features/tasks/types";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingState, EmptyState } from "@/components/states";
import { TaskStatusBadge } from "@/features/tasks/components/task-status-badge";
import { formatTime, projectName } from "@/lib/format";

/** Deletes finished tasks' stored record + logs. Waiting/running tasks never appear here (the server also refuses to delete them, so this is defense in depth). Markdown history is untouched. */
export function TaskCleanup() {
  const { tasks, loading, refresh } = useTaskList();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doneTasks = useMemo(
    () =>
      tasks
        .filter((t) => statusGroupOf(t.status) !== "active")
        .sort(
          (a, b) =>
            new Date(b.completedAt ?? b.createdAt).getTime() -
            new Date(a.completedAt ?? a.createdAt).getTime(),
        ),
    [tasks],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      for (const id of selected) {
        await tasksApi.remove(id);
      }
      setSelected(new Set());
      setConfirming(false);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-fg">완료 작업 정리</h2>
        <p className="text-sm text-fg-muted">
          끝난 작업의 기록을 삭제합니다. 대기 중이거나 실행 중인 작업은 목록에 없습니다. 삭제해도
          Markdown 기록은 남습니다.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {loading ? (
          <LoadingState padding="md" className="justify-center" />
        ) : doneTasks.length === 0 ? (
          <EmptyState title="정리할 완료 작업이 없습니다" padding="sm" />
        ) : (
          <div className="max-h-80 divide-y divide-border overflow-y-auto">
            {/*
              Two lines per row rather than five columns: this list now lives
              in the narrower of the settings page's two columns, where a
              full-width timestamp column would have nowhere to go. Title and
              status stay on the identifying line; project and completion
              time drop to a quieter one underneath.
            */}
            {doneTasks.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-fg/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggle(t.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-sm accent-brand"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-fg-secondary">{t.title}</span>
                    <TaskStatusBadge status={t.status} />
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-xs text-fg-muted">
                    <span className="mono shrink-0 text-fg-faint">{t.jobId}</span>
                    <span className="mono min-w-0 truncate">{projectName(t.projectPath)}</span>
                    <span aria-hidden className="shrink-0 text-fg-faint">
                      ·
                    </span>
                    <span className="mono shrink-0 text-fg-faint">{formatTime(t.completedAt)}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-border bg-fg/[0.02] px-4 py-3">
          {error ? <span className="mr-auto text-xs text-danger">{error}</span> : null}
          <span className="text-xs text-fg-muted">{selected.size}개 선택됨</span>
          <Button
            variant="outline"
            size="sm"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            disabled={selected.size === 0}
            onClick={() => setConfirming(true)}
          >
            선택 삭제
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title="작업 삭제"
        message={`선택한 ${selected.size}개 작업을 삭제합니다. 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        busy={busy}
        onConfirm={onDelete}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
