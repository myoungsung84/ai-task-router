"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/button";
import { CopyButton } from "@/components/copy-button";
import { EmptyState, LoadingState } from "@/components/states";
import { cn } from "@/lib/format";
import { tasksApi } from "../api/tasks-api";
import { splitDiffByFile } from "../lib/parse-file-diffs";
import type { TaskDiff } from "../types";

/** `null` selects "전체 보기" (the whole Task's diff — the only view this component had before the per-file split). */
type Selection = string | null;

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
  const [selected, setSelected] = useState<Selection>(null);

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
    setSelected(null); // a refetch (new Task, or this one just finished) always starts back on "전체 보기"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchKey]);

  const segments = useMemo(
    () => (diff ? splitDiffByFile(diff.diff, diff.changedFiles) : []),
    [diff],
  );
  const selectedSegment = segments.find((s) => s.file.path === selected) ?? null;
  // A selected path can go stale (refetched list, that file no longer
  // changed) — fall back to "전체 보기" instead of rendering an empty pane.
  const showingWholeDiff = selected === null || !selectedSegment;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">변경 파일</h3>
        <div className="flex items-center gap-2">
          <CopyButton
            text={showingWholeDiff ? diff?.diff : selectedSegment?.diffText}
            label={showingWholeDiff ? "diff 복사" : "이 파일 diff 복사"}
          />
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          {/* File list — its own scroll area so a long change set never pushes the diff pane below the fold. */}
          <ul className="mono flex max-h-72 shrink-0 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border bg-surface-sunken p-1.5 text-xs sm:w-64">
            <li>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left transition-colors duration-fast",
                  showingWholeDiff
                    ? "bg-fg/10 text-fg"
                    : "text-fg-secondary hover:bg-fg/[0.06] hover:text-fg",
                )}
              >
                전체 보기 · {diff.changedFiles.length}개 파일
              </button>
            </li>
            {segments.map((segment) => (
              <li key={segment.file.path}>
                <button
                  type="button"
                  onClick={() => setSelected(segment.file.path)}
                  className={cn(
                    "flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors duration-fast",
                    selected === segment.file.path && selectedSegment
                      ? "bg-fg/10 text-fg"
                      : "text-fg-secondary hover:bg-fg/[0.06] hover:text-fg",
                  )}
                >
                  <span className="shrink-0 text-fg-muted">{segment.file.status}</span>
                  <span className="min-w-0 flex-1 break-all">{segment.file.path}</span>
                  {segment.additions > 0 || segment.deletions > 0 ? (
                    <span className="shrink-0 whitespace-nowrap text-fg-faint">
                      {segment.additions > 0 ? (
                        <span className="text-success">+{segment.additions}</span>
                      ) : null}
                      {segment.additions > 0 && segment.deletions > 0 ? " " : ""}
                      {segment.deletions > 0 ? (
                        <span className="text-danger">-{segment.deletions}</span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0 flex-1">
            {showingWholeDiff ? (
              diff.diff ? (
                <pre className="mono max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-sunken p-4 text-xs leading-relaxed text-fg-secondary">
                  {diff.diff}
                </pre>
              ) : (
                <EmptyState title="표시할 diff 내용이 없습니다" padding="sm" />
              )
            ) : selectedSegment.diffText ? (
              <pre className="mono max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-sunken p-4 text-xs leading-relaxed text-fg-secondary">
                {selectedSegment.diffText}
              </pre>
            ) : (
              <EmptyState
                title="이 파일의 diff 미리보기가 없습니다"
                description="새로 추가된(추적되지 않은) 파일은 git diff에 내용이 표시되지 않습니다. 파일 자체는 작업 결과에서 확인하세요."
                padding="sm"
              />
            )}
          </div>
        </div>
      ) : diff ? (
        <EmptyState title="변경된 파일이 없습니다" padding="sm" />
      ) : null}
    </div>
  );
}
