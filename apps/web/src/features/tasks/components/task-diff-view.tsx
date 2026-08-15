"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { CopyButton } from "@/components/copy-button";
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
    <Card
      title={
        <div className="flex items-center justify-between gap-2">
          <span>변경 파일 / git diff</span>
          <div className="flex items-center gap-2">
            <CopyButton text={diff?.diff} label="diff 복사" />
            <Button variant="ghost" onClick={() => void load()} disabled={loading}>
              새로고침
            </Button>
          </div>
        </div>
      }
    >
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {diff && diff.changedFiles.length > 0 ? (
        <ul className="mono mb-3 space-y-1 text-xs">
          {diff.changedFiles.map((f) => (
            <li key={f.path} className="text-[#c8d1db]">
              <span className="mr-2 text-[#8291a3]">{f.status}</span>
              {f.path}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-[#8291a3]">변경된 파일이 없습니다.</p>
      )}

      {diff?.diff ? (
        <pre className="mono max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-black/30 p-3 text-xs text-[#c8d1db]">
          {diff.diff}
        </pre>
      ) : null}
    </Card>
  );
}
