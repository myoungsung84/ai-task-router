"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/button";
import { CopyButton } from "@/components/copy-button";
import { EmptyState, LoadingState } from "@/components/states";
import { tasksApi } from "../api/tasks-api";
import type { TaskDiff } from "../types";

export function TaskDiffView({
  taskId,
  autoFetchKey,
}: {
  taskId: string;
  /** Changing this value (e.g. task.status) triggers an automatic refetch. */
  autoFetchKey: string;
}) {
  const [diff, setDiff] = useState<TaskDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDiff(await tasksApi.diff(taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">변경 파일</h3>
        <div className="flex items-center gap-2">
          <CopyButton text={diff?.diff} label="diff 복사" />
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void load()}
            loading={loading}
          >
            새로고침
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {loading && !diff ? (
        <LoadingState />
      ) : diff && diff.changedFiles.length > 0 ? (
        <ul className="mono space-y-1 text-xs">
          {diff.changedFiles.map((f) => (
            <li key={f.path} className="break-all text-fg-secondary">
              <span className="mr-2 text-fg-muted">{f.status}</span>
              {f.path}
            </li>
          ))}
        </ul>
      ) : diff ? (
        <EmptyState title="변경된 파일이 없습니다" padding="sm" />
      ) : null}

      {diff?.diff ? (
        <pre className="mono max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-sunken p-4 text-xs leading-relaxed text-fg-secondary">
          {diff.diff}
        </pre>
      ) : null}
    </div>
  );
}
