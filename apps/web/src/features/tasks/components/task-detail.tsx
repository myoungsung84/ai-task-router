"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTask } from "../hooks/use-task";
import { tasksApi } from "../api/tasks-api";
import { TaskStatusBadge } from "./task-status-badge";
import { WorkflowTimeline } from "./workflow-timeline";
import { TaskLogPanel } from "./task-log-panel";
import { ReviewPanel } from "./review-panel";
import { TaskDiffView } from "./task-diff-view";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Tabs } from "@/components/tabs";
import { formatDuration, formatTime } from "@/lib/format";
import { AGENT_LABEL } from "../workflow-labels";
import type { LogSource } from "../types";

const CANCELLABLE = new Set(["RUNNING", "REVIEWING"]);
const RESTARTABLE = new Set(["QUEUED", "FAILED", "CANCELLED"]);

/** `id` may be the UUID or the Job ID (e.g. "T-1042") — the server resolves either. */
export function TaskDetail({ id }: { id: string }) {
  const { task, connected } = useTask(id);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const logSources = useMemo<LogSource[]>(() => {
    if (!task) return [];
    const present = new Set(task.logs.map((l) => l.source));
    const ordered: LogSource[] = ["claude", "codex", "system"].filter((s) =>
      present.has(s as LogSource),
    ) as LogSource[];
    return ordered.length > 0 ? ordered : ["system"];
  }, [task]);

  if (!task) {
    return <p className="text-sm text-[#8291a3]">불러오는 중...</p>;
  }

  async function onCancel() {
    setConfirmingCancel(false);
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

  const reviewSteps = task.workflow.steps.filter((s) => s.action === "review");

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-[#8291a3] hover:text-white">
        ← Tasks
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="mono text-sm text-[#8291a3]">{task.jobId}</span>
            <TaskStatusBadge status={task.status} />
          </div>
          <h1 className="mt-1 text-xl font-semibold text-white">{task.title}</h1>
          <p className="mono mt-1 text-sm text-[#8291a3]">
            {task.projectPath} · branch: {task.branch ?? task.gitInfo?.resolvedBranch ?? "-"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!connected ? (
            <span className="text-xs text-amber-400">실시간 연결 끊김 — 재연결 중...</span>
          ) : null}
          <span className="mono text-xs text-[#8291a3]">
            {formatDuration(task.startedAt, task.completedAt)}
          </span>
          {CANCELLABLE.has(task.status) ? (
            <Button
              variant="danger"
              onClick={() => setConfirmingCancel(true)}
              disabled={actionBusy}
            >
              작업 중단
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

      <Card title="Workflow">
        <WorkflowTimeline workflow={task.workflow} />
      </Card>

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

      <Tabs
        defaultValue="overview"
        tabs={[
          {
            value: "overview",
            label: "개요",
            content: (
              <div className="space-y-4">
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
                {task.workflow.steps
                  .filter((s) => s.result?.summary)
                  .map((s) => (
                    <Card key={s.id} title={`${AGENT_LABEL[s.agent]} 결과 요약`}>
                      <p className="whitespace-pre-wrap text-sm text-[#c8d1db]">
                        {s.result?.summary}
                      </p>
                    </Card>
                  ))}
              </div>
            ),
          },
          {
            value: "logs",
            label: "실시간 로그",
            content: (
              <div className="space-y-4">
                {logSources.map((source) => (
                  <TaskLogPanel key={source} logs={task.logs} source={source} />
                ))}
              </div>
            ),
          },
          {
            value: "diff",
            label: "변경 파일 / Diff",
            content: <TaskDiffView taskId={id} autoFetchKey={`${task.status}`} />,
          },
          {
            value: "review",
            label: "리뷰",
            content:
              reviewSteps.length > 0 ? (
                <div className="space-y-4">
                  {reviewSteps.map((s) => (
                    <ReviewPanel
                      key={s.id}
                      title={`${AGENT_LABEL[s.agent]} 리뷰 결과`}
                      review={s.result?.review ?? null}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#8291a3]">이 Workflow에는 리뷰 Step이 없습니다.</p>
              ),
          },
        ]}
      />

      <ConfirmDialog
        open={confirmingCancel}
        title="작업 중단"
        message={`${task.jobId} 작업을 중단할까요?`}
        confirmLabel="작업 중단"
        onConfirm={onCancel}
        onCancel={() => setConfirmingCancel(false)}
      />
    </div>
  );
}
