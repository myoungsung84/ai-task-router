"use client";

import { useMemo, useState } from "react";
import { useTaskList } from "@/features/tasks/hooks/use-task-list";
import { tasksApi } from "@/features/tasks/api/tasks-api";
import { statusGroupOf } from "@/features/tasks/types";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatTime, projectName } from "@/lib/format";

/** Deletes completed/failed/cancelled Task JSON+logs — RUNNING/REVIEWING tasks never appear here (server also refuses to delete them, so this is defense in depth, not the only guard). Markdown history is untouched. */
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
    <Card title="완료 Task 정리">
      <p className="mb-3 text-xs text-[#8291a3]">
        완료/확인 필요/취소/실패한 Task를 선택해 삭제합니다. 대기 중이거나 실행 중인 Task는 목록에
        나타나지 않습니다 — 대시보드에서 먼저 취소(대기 중) 또는 중단(실행 중)한 뒤 다시 확인하세요.
        삭제해도 Markdown History는 남습니다.
      </p>
      {loading ? (
        <p className="text-sm text-[#8291a3]">불러오는 중...</p>
      ) : doneTasks.length === 0 ? (
        <p className="text-sm text-[#8291a3]">정리할 완료 Task가 없습니다.</p>
      ) : (
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {doneTasks.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/5"
            >
              <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
              <span className="mono text-xs text-[#8291a3]">{t.jobId}</span>
              <span className="truncate text-[#c8d1db]">{t.title}</span>
              <span className="mono ml-auto shrink-0 text-xs text-[#546274]">
                {projectName(t.projectPath)} · {formatTime(t.completedAt)}
              </span>
            </label>
          ))}
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      <div className="mt-4 flex justify-end">
        <Button variant="danger" disabled={selected.size === 0} onClick={() => setConfirming(true)}>
          선택 삭제 ({selected.size})
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Task 삭제"
        message={`선택한 ${selected.size}개 Task를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        busy={busy}
        onConfirm={onDelete}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
