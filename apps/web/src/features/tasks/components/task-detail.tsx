"use client";

import { useState } from "react";
import { useTask } from "../hooks/use-task";
import { tasksApi } from "../api/tasks-api";
import { TaskStatusBadge, RunnerStatusPill } from "./task-status-badge";
import { TaskLogPanel } from "./task-log-panel";
import { CodexReviewPanel } from "./codex-review-panel";
import { TaskDiffView } from "./task-diff-view";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { formatDuration, formatTime } from "@/lib/format";

const CANCELLABLE = new Set(["RUNNING", "REVIEWING"]);
const RESTARTABLE = new Set(["QUEUED", "FAILED", "CANCELLED"]);

export function TaskDetail({ id }: { id: string }) {
  const { task, connected } = useTask(id);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  if (!task) {
    return <p className="text-sm text-[#8291a3]">불러오는 중...</p>;
  }

  async function onCancel() {
    setActionBusy(true);
    setActionError(null);
    try {
      await tasksApi.cancel(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function onStart() {
    setActionBusy(true);
    setActionError(null);
    try {
      await tasksApi.start(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">{task.title}</h1>
          <p className="mono mt-1 text-sm text-[#8291a3]">
            {task.projectPath} · branch: {task.branch ?? task.gitInfo?.resolvedBranch ?? "-"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!connected ? (
            <span className="text-xs text-amber-400">실시간 연결 끊김 — 재연결 중...</span>
          ) : null}
          {CANCELLABLE.has(task.status) ? (
            <Button variant="danger" onClick={onCancel} disabled={actionBusy}>
              중단
            </Button>
          ) : null}
          {RESTARTABLE.has(task.status) ? (
            <Button variant="secondary" onClick={onStart} disabled={actionBusy}>
              {task.status === "QUEUED" ? "실행" : "다시 실행"}
            </Button>
          ) : null}
        </div>
      </div>

      {actionError ? <p className="text-sm text-red-400">{actionError}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <TaskStatusBadge status={task.status} />
        <RunnerStatusPill label="Claude" status={task.claudeStatus} />
        <RunnerStatusPill label="Codex" status={task.codexStatus} />
        <span className="text-xs text-[#8291a3]">
          실행 시간: {formatDuration(task.startedAt, task.completedAt)}
        </span>
      </div>

      {task.error ? (
        <Card className="border-red-500/30 bg-red-950/20">
          <p className="text-sm text-red-300">{task.error}</p>
        </Card>
      ) : null}

      {task.gitInfo?.hadUncommittedChangesBeforeStart ? (
        <Card className="border-amber-500/30 bg-amber-950/10">
          <p className="text-sm text-amber-300">
            ⚠ 이 프로젝트의 working tree에는 Task 시작 전부터 커밋되지 않은 변경사항이 있었습니다.
            해당 변경사항은 삭제/초기화되지 않고 그대로 유지됩니다.
          </p>
        </Card>
      ) : null}

      <Card title="작업 지시사항">
        <p className="whitespace-pre-wrap text-sm text-[#c8d1db]">{task.instruction}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#8291a3] sm:grid-cols-4">
          <div>
            <dt>baseBranch</dt>
            <dd className="mono text-[#c8d1db]">{task.baseBranch ?? "-"}</dd>
          </div>
          <div>
            <dt>생성 시각</dt>
            <dd className="text-[#c8d1db]">{formatTime(task.createdAt)}</dd>
          </div>
          <div>
            <dt>시작 시각</dt>
            <dd className="text-[#c8d1db]">{formatTime(task.startedAt)}</dd>
          </div>
          <div>
            <dt>완료 시각</dt>
            <dd className="text-[#c8d1db]">{formatTime(task.completedAt)}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <TaskLogPanel logs={task.logs} source="claude" />
        <TaskLogPanel logs={task.logs} source="codex" />
      </div>

      <TaskLogPanel logs={task.logs} source="system" />

      <TaskDiffView taskId={id} autoFetchKey={`${task.status}-${task.claudeStatus}`} />

      <CodexReviewPanel review={task.codexReviewResult} />

      {task.claudeResult ? (
        <Card title="Claude 실행 결과">
          <dl className="grid grid-cols-2 gap-2 text-xs text-[#8291a3] sm:grid-cols-3">
            <div>
              <dt>exit code</dt>
              <dd className="mono text-[#c8d1db]">{task.claudeResult.exitCode ?? "-"}</dd>
            </div>
            <div>
              <dt>성공 여부</dt>
              <dd className="text-[#c8d1db]">{task.claudeResult.success ? "성공" : "실패"}</dd>
            </div>
          </dl>
        </Card>
      ) : null}
    </div>
  );
}
