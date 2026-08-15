"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTask } from "../hooks/use-task";
import { useTaskList } from "../hooks/use-task-list";
import { useNowTick } from "../hooks/use-now-tick";
import { tasksApi } from "../api/tasks-api";
import { TaskStatusBadge } from "./task-status-badge";
import { WorkflowTimeline } from "./workflow-timeline";
import { TaskActivityLog } from "./task-activity-log";
import { ReviewPanel } from "./review-panel";
import { TaskDiffView } from "./task-diff-view";
import { NewTaskModal } from "./new-task-modal";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { Tabs } from "@/components/tabs";
import { useToast } from "@/components/toast";
import { formatDuration, formatTime } from "@/lib/format";
import { AGENT_LABEL, ACTION_LABEL, LINK_KIND_LABEL } from "../workflow-labels";
import { taskToCopyText } from "../lib/task-copy-text";
import { buildFollowUpPrefill } from "../lib/follow-up";
import { isTerminalStatus } from "../types";
import type { TaskLinkKind } from "../types";

const CANCELLABLE = new Set(["QUEUED", "RUNNING", "REVIEWING"]);
const RESTARTABLE = new Set(["QUEUED", "FAILED", "CANCELLED"]);

/** `id` may be the UUID or the Job ID (e.g. "T-1042") — the server resolves either. */
export function TaskDetail({ id }: { id: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { task, connected, notFound } = useTask(id);
  const { tasks: allTasks } = useTaskList();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingResolve, setConfirmingResolve] = useState(false);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [followUpKind, setFollowUpKind] = useState<TaskLinkKind | null>(null);

  // Keeps the header's elapsed-duration readout moving between log lines
  // for a genuinely active Task — real timestamp diff, not fake progress.
  useNowTick(task?.status === "RUNNING" || task?.status === "REVIEWING");

  const warningIssueCount = useMemo(() => {
    if (!task || task.status !== "WARNING") return 0;
    return task.workflow.steps.reduce((sum, s) => sum + (s.result?.review?.issues.length ?? 0), 0);
  }, [task]);

  // Severity breakdown across every review Step's issues — used both to
  // decide whether "검토 후 완료 처리" makes sense and to spell out exactly
  // what's being signed off on in the confirm dialog.
  const reviewIssueSummary = useMemo(() => {
    if (!task) return { total: 0, high: 0, medium: 0, low: 0 };
    const issues = task.workflow.steps.flatMap((s) => s.result?.review?.issues ?? []);
    const counts = { high: 0, medium: 0, low: 0 };
    for (const i of issues) counts[i.severity] += 1;
    return { total: issues.length, ...counts };
  }, [task]);

  // "검토 후 완료 처리" is available for ANY severity — the user is the
  // final judge of a genuine review outcome — but never when the review
  // itself didn't produce a trustworthy result: an implement/analyze Step
  // failed, no review Step actually ran, or a review Step's own process
  // failed. This is only an approximation for showing/hiding the button;
  // the server (taskService.resolveWarning) re-validates authoritatively,
  // including the one case this can't detect client-side — a review Step
  // that "succeeded" but whose output never actually parsed (falls back to
  // a synthetic issue that looks like a normal result here).
  const canCompleteAfterReview = useMemo(() => {
    if (!task || task.status !== "WARNING") return false;
    const nonReviewFailed = task.workflow.steps.some(
      (s) => s.action !== "review" && s.status === "FAILED",
    );
    if (nonReviewFailed) return false;
    const ranReviewSteps = task.workflow.steps.filter(
      (s) => s.action === "review" && (s.status === "SUCCESS" || s.status === "FAILED"),
    );
    if (ranReviewSteps.length === 0) return false;
    return ranReviewSteps.every((s) => s.status === "SUCCESS" && !!s.result?.review);
  }, [task]);

  // Origin→follow-up chain, reconstructed client-side from the already-
  // polled task list — no dedicated endpoint needed.
  const lineage = useMemo(() => {
    if (!task) return null;
    const byId = new Map(allTasks.map((t) => [t.id, t]));
    const ancestors: typeof allTasks = [];
    let parentId = task.parentTaskId;
    const guard = new Set<string>([task.id]);
    while (parentId && !guard.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break;
      guard.add(parent.id);
      ancestors.unshift(parent);
      parentId = parent.parentTaskId;
    }
    const children = allTasks.filter((t) => t.parentTaskId === task.id);
    if (ancestors.length === 0 && children.length === 0) return null;
    return { ancestors, children };
  }, [allTasks, task]);

  if (notFound) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm text-[#8291a3] hover:text-white">
          ← Tasks
        </Link>
        <Card>
          <p className="text-sm text-[#c8d1db]">
            Task를 찾을 수 없습니다 (<span className="mono">{id}</span>). 삭제되었거나 잘못된 주소일
            수 있습니다.
          </p>
          <div className="mt-3">
            <Link href="/">
              <Button variant="secondary">Tasks 목록으로</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!task) {
    return <p className="text-sm text-[#8291a3]">불러오는 중...</p>;
  }

  async function onCancel() {
    setConfirmingCancel(false);
    setActionBusy(true);
    setActionError(null);
    try {
      await tasksApi.cancel(id);
      showToast("success", "작업을 취소했습니다.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message);
      showToast("error", message);
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

  async function onDelete() {
    setDeleteBusy(true);
    try {
      await tasksApi.remove(id);
      showToast("success", `${task!.jobId} 작업을 삭제했습니다.`);
      router.push("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message);
      showToast("error", message);
      setConfirmingDelete(false);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onResolveWarning() {
    setResolveBusy(true);
    try {
      await tasksApi.resolveWarning(id);
      showToast("success", "리뷰 결과를 확인하고 완료 처리했습니다.");
      setConfirmingResolve(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message);
      showToast("error", message);
    } finally {
      setResolveBusy(false);
    }
  }

  const reviewSteps = task.workflow.steps.filter((s) => s.action === "review");
  const isQueued = task.status === "QUEUED";
  const deletable = isTerminalStatus(task.status);
  const followUpPrefill = followUpKind ? buildFollowUpPrefill(task, followUpKind) : undefined;

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-[#8291a3] hover:text-white">
        ← Tasks
      </Link>

      {lineage ? (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border border-[#232c38] bg-[#0e131a] px-3 py-2 text-xs text-[#8291a3]">
          {lineage.ancestors.map((a) => (
            <span key={a.id} className="flex items-center gap-1.5">
              <Link href={`/tasks/${a.jobId}`} className="hover:text-white hover:underline">
                {a.jobId} {a.linkKind ? LINK_KIND_LABEL[a.linkKind] : "원본"}
              </Link>
              <span>→</span>
            </span>
          ))}
          <span className="font-medium text-white">
            {task.jobId} {task.linkKind ? LINK_KIND_LABEL[task.linkKind] : "원본"} (현재)
          </span>
          {lineage.children.length > 0 ? (
            <span className="ml-2">
              · 후속:{" "}
              {lineage.children.map((c, i) => (
                <span key={c.id}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/tasks/${c.jobId}`} className="hover:text-white hover:underline">
                    {c.jobId} ({c.linkKind ? LINK_KIND_LABEL[c.linkKind] : "원본"})
                  </Link>
                </span>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="mono text-sm text-[#8291a3]">{task.jobId}</span>
            <TaskStatusBadge status={task.status} />
          </div>
          <h1 className="mt-1 text-xl font-semibold text-white">{task.title}</h1>
          <p className="mono mt-1 break-all text-sm text-[#8291a3]">
            {task.projectPath} · branch: {task.branch ?? task.gitInfo?.resolvedBranch ?? "-"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!connected ? (
            <span className="text-xs text-amber-400">실시간 연결 끊김 — 재연결 중...</span>
          ) : null}
          <span className="mono text-xs text-[#8291a3]">
            {formatDuration(task.startedAt, task.completedAt)}
          </span>
          {isQueued ? (
            <Button variant="secondary" onClick={onStart} disabled={actionBusy}>
              실행
            </Button>
          ) : RESTARTABLE.has(task.status) ? (
            <Button variant="secondary" onClick={onStart} disabled={actionBusy}>
              다시 실행
            </Button>
          ) : null}
          {CANCELLABLE.has(task.status) ? (
            <Button
              variant="danger"
              onClick={() => setConfirmingCancel(true)}
              disabled={actionBusy}
            >
              {isQueued ? "취소" : "작업 중단"}
            </Button>
          ) : null}
          {deletable ? (
            <Button
              variant="danger"
              onClick={() => setConfirmingDelete(true)}
              disabled={actionBusy}
            >
              삭제
            </Button>
          ) : null}
        </div>
      </div>

      {actionError ? <p className="text-sm text-red-400">{actionError}</p> : null}

      <Card
        title={
          <div className="flex items-center justify-between">
            <span>Workflow</span>
            <CopyButton text={taskToCopyText(task)} label="전체 복사" />
          </div>
        }
      >
        <WorkflowTimeline workflow={task.workflow} />
      </Card>

      {task.status === "WARNING" ? (
        <Card className="border-amber-500/30 bg-amber-950/10">
          <div className="space-y-3">
            <p className="text-sm text-amber-300">
              ⚠ 검토가 필요합니다.{" "}
              {warningIssueCount > 0
                ? `리뷰에서 ${warningIssueCount}건이 발견됐습니다.`
                : "리뷰 Step 실행 자체가 실패했습니다."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setActiveTab("review")}>
                리뷰 보기 →
              </Button>
              <Button variant="secondary" onClick={() => setFollowUpKind("fix_and_rereview")}>
                수정 후 재검토
              </Button>
              {reviewSteps.length > 0 ? (
                <Button variant="secondary" onClick={() => setFollowUpKind("review_only")}>
                  재검토만 실행
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setFollowUpKind("rerun")}>
                원본 Workflow 다시 실행
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {task.error ? (
        <Card
          className="border-red-500/30 bg-red-950/20"
          title={
            <div className="flex items-center justify-between">
              <span className="text-red-300">
                {task.status === "FAILED"
                  ? "실패했습니다 — 로그를 확인하거나 다시 실행하세요."
                  : "오류"}
              </span>
              <CopyButton text={task.error} label="오류 복사" />
            </div>
          }
        >
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
        value={activeTab}
        onValueChange={setActiveTab}
        tabs={[
          {
            value: "overview",
            label: "개요",
            content: (
              <div className="space-y-4">
                <Card
                  title={
                    <div className="flex items-center justify-between">
                      <span>원문 지시서</span>
                      <CopyButton text={task.instruction} label="지시서 복사" />
                    </div>
                  }
                >
                  <p className="whitespace-pre-wrap text-sm text-[#c8d1db]">{task.instruction}</p>
                </Card>

                <Card title="메타데이터">
                  <dl className="grid grid-cols-2 gap-2 text-xs text-[#8291a3] sm:grid-cols-4">
                    <div>
                      <dt>Job ID</dt>
                      <dd className="mono text-[#c8d1db]">{task.jobId}</dd>
                    </div>
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
                    <div className="col-span-2 sm:col-span-4">
                      <dt>프로젝트 경로</dt>
                      <dd className="mono break-all text-[#c8d1db]">{task.projectPath}</dd>
                    </div>
                  </dl>
                </Card>

                {task.workflow.steps
                  // review Step summaries are the agent's raw JSON reply
                  // (see runners/*-runner.ts) — the Review 탭's ReviewPanel
                  // already renders that structured, so this card is only
                  // for implement/analyze Steps' natural-language summary.
                  .filter((s) => s.action !== "review" && s.result?.summary)
                  .map((s) => (
                    <Card
                      key={s.id}
                      title={
                        <div className="flex items-center justify-between">
                          <span>
                            {AGENT_LABEL[s.agent]} {ACTION_LABEL[s.action]} 결과 요약
                          </span>
                          <CopyButton text={s.result?.summary} label="복사" />
                        </div>
                      }
                    >
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
            content: <TaskActivityLog logs={task.logs} />,
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
                  {canCompleteAfterReview ? (
                    <Card className="border-blue-500/20 bg-blue-500/5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-[#c8d1db]">
                          {reviewIssueSummary.total > 0
                            ? `이슈 ${reviewIssueSummary.total}건을 확인했다면 완료로 처리할 수 있습니다.`
                            : "리뷰 결과를 확인했다면 완료로 처리할 수 있습니다."}
                        </p>
                        <Button variant="secondary" onClick={() => setConfirmingResolve(true)}>
                          검토 후 완료 처리
                        </Button>
                      </div>
                    </Card>
                  ) : null}
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
        title={isQueued ? "Task 취소" : "작업 중단"}
        message={
          isQueued
            ? `${task.jobId} 작업을 취소할까요? 아직 시작되지 않았습니다.`
            : `${task.jobId} 작업을 중단할까요? 진행 중인 프로세스가 종료됩니다.`
        }
        confirmLabel={isQueued ? "작업 취소" : "작업 중단"}
        onConfirm={onCancel}
        onCancel={() => setConfirmingCancel(false)}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title="Task 삭제"
        message={`${task.jobId} "${task.title}" 작업을 삭제할까요? 이 작업은 되돌릴 수 없습니다. (Markdown 기록은 남습니다.)`}
        confirmLabel="삭제"
        busy={deleteBusy}
        onConfirm={onDelete}
        onCancel={() => setConfirmingDelete(false)}
      />

      <ConfirmDialog
        open={confirmingResolve}
        title="검토 후 완료 처리"
        message={
          reviewIssueSummary.total > 0
            ? `${task.jobId}: 리뷰에서 ${reviewIssueSummary.total}건의 이슈가 발견됐습니다` +
              ` (높음 ${reviewIssueSummary.high} · 중간 ${reviewIssueSummary.medium} · 낮음 ${reviewIssueSummary.low}).` +
              ` 이슈를 확인했으며 현재 결과를 완료(READY)로 처리합니다. 계속할까요?`
            : `${task.jobId}: 리뷰 결과를 확인했으며 현재 결과를 완료(READY)로 처리합니다. 계속할까요?`
        }
        confirmLabel="완료 처리"
        danger={false}
        busy={resolveBusy}
        onConfirm={onResolveWarning}
        onCancel={() => setConfirmingResolve(false)}
      />

      <NewTaskModal
        key={followUpKind ?? "none"}
        open={!!followUpKind}
        prefill={followUpPrefill}
        onClose={() => setFollowUpKind(null)}
      />
    </div>
  );
}
