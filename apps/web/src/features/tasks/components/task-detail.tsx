"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
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
import { AgentAvatar } from "@/components/agent-icon";
import { Button, IconButton } from "@/components/button";
import { SectionLabel } from "@/components/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { Tabs } from "@/components/tabs";
import { Alert } from "@/components/alert";
import { Badge } from "@/components/badge";
import { LoadingState } from "@/components/states";
import { useToast } from "@/components/toast";
import { cn, formatDuration, formatTime } from "@/lib/format";
import {
  AGENT_LABEL,
  ACTION_LABEL,
  ATTENTION_REASON_LABEL,
  LINK_KIND_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  attentionReasonOf,
  taskActivityPhrase,
} from "../workflow-labels";
import { taskToCopyText, taskToAiHandoffText } from "../lib/task-copy-text";
import { buildFollowUpPrefill } from "../lib/follow-up";
import { compareReviewIssueSeverity, isTerminalStatus, securityReviewLevelOf } from "../types";
import type { TaskDiff, TaskLinkKind } from "../types";

const CANCELLABLE = new Set(["QUEUED", "RUNNING", "REVIEWING"]);
const RESTARTABLE = new Set(["QUEUED", "FAILED", "CANCELLED"]);
const INSTRUCTION_COLLAPSE_LENGTH = 360;

/** One label/value pair in the metadata column. The value sits under its label rather than beside it, so a long path or a long timestamp wraps into its own space instead of pushing the label around. */
function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-fg-muted">{label}</dt>
      <dd className="text-sm text-fg-secondary">{children}</dd>
    </div>
  );
}

function Section({
  label,
  action,
  uppercase = true,
  children,
}: {
  label: string;
  action?: ReactNode;
  uppercase?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex min-h-[1.75rem] items-center justify-between gap-2">
        <SectionLabel uppercase={uppercase}>{label}</SectionLabel>
        {action}
      </div>
      {children}
    </section>
  );
}

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
  const [detailTab, setDetailTab] = useState("review");
  const [followUpKind, setFollowUpKind] = useState<TaskLinkKind | null>(null);
  const [instructionExpanded, setInstructionExpanded] = useState(false);
  const [diffSummary, setDiffSummary] = useState<TaskDiff | null>(null);

  // Keeps the header's elapsed readout moving between log lines for a
  // genuinely active task — real timestamp diff, not fake progress.
  useNowTick(task?.status === "RUNNING" || task?.status === "REVIEWING");

  // Lightweight changed-files summary for the always-visible overview — the
  // Diff tab independently fetches the same endpoint for the full diff
  // text, kept separate so switching tabs never re-fetches the (potentially
  // large) diff body just to show a count.
  useEffect(() => {
    if (!task || !isTerminalStatus(task.status)) return;
    let cancelled = false;
    void tasksApi
      .diff(task.id)
      .then((d) => {
        if (!cancelled) setDiffSummary(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task?.status]);

  const warningIssueCount = useMemo(() => {
    if (!task || task.status !== "WARNING") return 0;
    return task.workflow.steps.reduce((sum, s) => sum + (s.result?.review?.issues.length ?? 0), 0);
  }, [task]);

  // Same "확인 필요 사유" mapper the Task list uses — the Detail hero should
  // never diverge from the list on why this Task needs attention.
  const attentionReason = task ? attentionReasonOf(task) : null;

  // Severity breakdown across every review step's issues — used both to
  // decide whether "검토 후 완료 처리" makes sense and to spell out exactly
  // what's being signed off on in the confirm dialog.
  const reviewIssueSummary = useMemo(() => {
    if (!task) return { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    const issues = task.workflow.steps.flatMap((s) => s.result?.review?.issues ?? []);
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const i of issues) counts[i.severity] += 1;
    return { total: issues.length, ...counts };
  }, [task]);

  // This Task's Security standing — `null` when no review Issue is
  // category "SECURITY" (the common case), so every place below that reads
  // this only has to check for `null` rather than re-filtering issues[]
  // itself.
  const securityIssueSummary = useMemo(() => {
    if (!task) return { level: null as ReturnType<typeof securityReviewLevelOf>, count: 0 };
    const issues = task.workflow.steps.flatMap((s) => s.result?.review?.issues ?? []);
    const securityCount = issues.filter((i) => i.category === "SECURITY").length;
    return { level: securityReviewLevelOf(issues), count: securityCount };
  }, [task]);

  // Same issues as reviewIssueSummary, ordered Security-first (then by
  // severity) rather than however the reviewing agent happened to list
  // them — the Alert box only ever shows the first few, and for a Task
  // flagged for Security those are exactly the ones that belong up top.
  const topIssues = useMemo(() => {
    if (!task) return [];
    const issues = task.workflow.steps.flatMap((s) => s.result?.review?.issues ?? []);
    return [...issues]
      .sort((a, b) => {
        const aSecurity = a.category === "SECURITY" ? 1 : 0;
        const bSecurity = b.category === "SECURITY" ? 1 : 0;
        if (aSecurity !== bSecurity) return bSecurity - aSecurity;
        return compareReviewIssueSeverity(b.severity, a.severity);
      })
      .slice(0, 3);
  }, [task]);

  // "검토 후 완료 처리" is available for ANY severity — the user is the
  // final judge of a genuine review outcome — but never when the review
  // itself didn't produce a trustworthy result: an implement/analyze step
  // failed, no review step actually ran, or a review step's own process
  // failed. This is only an approximation for showing/hiding the button;
  // the server (taskService.resolveWarning) re-validates authoritatively,
  // including the one case this can't detect client-side — a review step
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

  const reviewSteps = useMemo(
    () => task?.workflow.steps.filter((s) => s.action === "review") ?? [],
    [task],
  );
  const reviewPassed =
    task?.status === "READY" &&
    reviewSteps.length > 0 &&
    reviewSteps.every((s) => s.result?.review?.result === "PASS");

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

  // Same lineage data, reshaped for WorkflowTimeline's "관련 Task" block —
  // the immediate parent's `linkKind` is *this* Task's own linkKind (it
  // describes how this Task relates to its parent), while each child's
  // `linkKind` is that child's own (it describes how the child relates to
  // this Task).
  const timelineRelations = useMemo(() => {
    if (!task) return undefined;
    const immediateParent = lineage?.ancestors[lineage.ancestors.length - 1] ?? null;
    return {
      parent: immediateParent ? { jobId: immediateParent.jobId, linkKind: task.linkKind } : null,
      children: (lineage?.children ?? []).map((c) => ({ jobId: c.jobId, linkKind: c.linkKind })),
    };
  }, [task, lineage]);

  // "AI 전달용 복사" — reuses the same relation data as the Timeline's
  // "관련 Task" block and the already-fetched diff summary, so this never
  // triggers an extra request just to build a copy-paste string.
  const aiHandoffText = useMemo(() => {
    if (!task) return "";
    return taskToAiHandoffText(task, {
      parent: timelineRelations?.parent,
      children: timelineRelations?.children,
      changedFiles: diffSummary?.changedFiles,
    });
  }, [task, timelineRelations, diffSummary]);

  if (notFound) {
    return (
      <div className="space-y-4">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> 작업 목록
        </Link>
        <p className="text-sm text-fg-secondary">
          작업을 찾을 수 없습니다 (<span className="mono">{id}</span>). 삭제되었거나 잘못된 주소일
          수 있습니다.
        </p>
        <Link href="/">
          <Button variant="secondary">작업 목록으로</Button>
        </Link>
      </div>
    );
  }

  if (!task) return <LoadingState label="작업을 불러오는 중" />;

  async function onCancel() {
    setConfirmingCancel(false);
    setActionBusy(true);
    setActionError(null);
    try {
      await tasksApi.cancel(id);
      showToast("success", "작업을 중단했습니다.");
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
      showToast("success", "검토 결과를 확인하고 완료 처리했습니다.");
      setConfirmingResolve(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionError(message);
      showToast("error", message);
    } finally {
      setResolveBusy(false);
    }
  }

  const isQueued = task.status === "QUEUED";
  const deletable = isTerminalStatus(task.status);
  const followUpPrefill = followUpKind ? buildFollowUpPrefill(task, followUpKind) : undefined;
  const agents = Array.from(new Set(task.workflow.steps.map((s) => s.agent)));
  const instructionLong = task.instruction.length > INSTRUCTION_COLLAPSE_LENGTH;
  const summarySteps = task.workflow.steps.filter(
    (s) => s.action !== "review" && s.result?.summary,
  );

  const resolveButton = (
    <Button
      variant="secondary"
      size="sm"
      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
      onClick={() => setConfirmingResolve(true)}
    >
      검토 후 완료 처리
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
        <Link href="/" className="flex items-center gap-1.5 text-sm hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> 작업 목록
        </Link>
        {lineage ? (
          <>
            <span aria-hidden className="text-fg-faint">
              /
            </span>
            {lineage.ancestors.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5">
                <Link href={`/tasks/${a.jobId}`} className="hover:text-fg hover:underline">
                  {a.jobId} {a.linkKind ? LINK_KIND_LABEL[a.linkKind] : "원본"}
                </Link>
                <span aria-hidden>→</span>
              </span>
            ))}
            <span className="font-medium text-fg-secondary">
              {task.jobId} {task.linkKind ? LINK_KIND_LABEL[task.linkKind] : "원본"}
            </span>
            {lineage.children.length > 0 ? (
              <>
                <span aria-hidden className="text-fg-faint">
                  ·
                </span>
                <span>후속</span>
                {lineage.children.map((c) => (
                  <Link
                    key={c.id}
                    href={`/tasks/${c.jobId}`}
                    className="hover:text-fg hover:underline"
                  >
                    {c.jobId}
                  </Link>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Hero — status, name and the actions available on it, in one block. */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            <span className="mono text-xs text-fg-muted">{task.jobId}</span>
            <span aria-hidden className="text-fg-faint">
              ·
            </span>
            <span className="text-xs text-fg-muted">{taskActivityPhrase(task)}</span>
            {!connected && !isTerminalStatus(task.status) ? (
              <span className="text-xs text-warning">실시간 연결 끊김, 재연결 중</span>
            ) : null}
          </div>
          <h1 className="break-words text-2xl font-semibold leading-snug text-fg">{task.title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isQueued ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Play className="h-3.5 w-3.5" />}
              onClick={onStart}
              disabled={actionBusy}
            >
              실행
            </Button>
          ) : RESTARTABLE.has(task.status) ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={onStart}
              disabled={actionBusy}
            >
              다시 실행
            </Button>
          ) : null}
          {CANCELLABLE.has(task.status) ? (
            <Button
              variant="outline"
              size="sm"
              icon={<Square className="h-3.5 w-3.5" />}
              onClick={() => setConfirmingCancel(true)}
              disabled={actionBusy}
            >
              {isQueued ? "대기 취소" : "실행 중단"}
            </Button>
          ) : null}
          <CopyButton text={aiHandoffText} label="AI 전달용 복사" />
          <CopyButton text={taskToCopyText(task)} label="전체 복사" />
          {deletable ? (
            <IconButton
              label="삭제"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
              disabled={actionBusy}
              className="hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </IconButton>
          ) : null}
        </div>
      </header>

      {/*
        Two columns on a wide screen: what happened (left, and always the
        first thing read) and what it was run against (right). Both start
        at the page's own left edge and keep their own width all the way
        down, so nothing switches measure halfway through the page — the
        left column lands at a comfortable reading width on its own rather
        than by capping a full-width block partway down. Below `lg` the
        metadata simply follows the result.
      */}
      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-8">
          {/* Key result — never gated behind a tab click. */}
          {task.status === "WARNING" ? (
            <Alert
              // Security HIGH/CRITICAL escalates the whole Alert to danger —
              // still the same WARNING Task status underneath (no new status
              // introduced), just a clearer visual cue than the ordinary
              // "수정 필요" case.
              tone={
                attentionReason === "SECURITY_CRITICAL" || attentionReason === "SECURITY_HIGH"
                  ? "danger"
                  : "warning"
              }
              title={
                attentionReason === "SECURITY_CRITICAL" || attentionReason === "SECURITY_HIGH"
                  ? `${ATTENTION_REASON_LABEL[attentionReason]} — Security 이슈 ${securityIssueSummary.count}건`
                  : attentionReason === "REVIEW_FAILED"
                    ? `${ATTENTION_REASON_LABEL.REVIEW_FAILED} — 검토를 완료하지 못했습니다`
                    : `${ATTENTION_REASON_LABEL.REVIEW_NEEDS_FIX} ${warningIssueCount}건`
              }
              actions={
                <>
                  {canCompleteAfterReview ? resolveButton : null}
                  <Button variant="outline" size="sm" onClick={() => setDetailTab("review")}>
                    리뷰 전체 보기
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFollowUpKind("fix_and_rereview")}
                  >
                    수정 후 재검토
                  </Button>
                  {reviewSteps.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFollowUpKind("review_only")}
                    >
                      재검토만 실행
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => setFollowUpKind("rerun")}>
                    원본 다시 실행
                  </Button>
                </>
              }
            >
              {topIssues.length > 0 ? (
                <ul className="space-y-1.5">
                  {topIssues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge tone={SEVERITY_TONE[issue.severity]}>
                        {SEVERITY_LABEL[issue.severity]}
                      </Badge>
                      {issue.category === "SECURITY" ? (
                        <Badge tone="info">Security</Badge>
                      ) : null}
                      <span className="min-w-0 flex-1 break-words">
                        {issue.file ? (
                          <span className="mono text-fg-muted">{issue.file}: </span>
                        ) : null}
                        {issue.message}
                      </span>
                    </li>
                  ))}
                  {warningIssueCount > topIssues.length ? (
                    <li className="text-fg-muted">외 {warningIssueCount - topIssues.length}건</li>
                  ) : null}
                </ul>
              ) : (
                "리뷰 단계 실행 자체가 실패했습니다. 로그를 확인하거나 다시 실행하세요."
              )}
            </Alert>
          ) : reviewPassed ? (
            <Alert tone="success" title="검토 통과">
              {AGENT_LABEL[reviewSteps[0]!.agent]}가 변경 사항을 검토했고 지적 사항이 없습니다.
            </Alert>
          ) : task.status === "FAILED" ? (
            <Alert
              tone="danger"
              title={ATTENTION_REASON_LABEL.EXECUTION_FAILED}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={onStart}
                >
                  다시 실행
                </Button>
              }
            >
              {task.error ?? "로그를 확인하세요."}
            </Alert>
          ) : null}

          {task.gitInfo?.hadUncommittedChangesBeforeStart ? (
            <Alert tone="warning">
              시작 전부터 커밋되지 않은 변경 사항이 있던 저장소입니다. 해당 변경 사항은 삭제되거나
              초기화되지 않고 그대로 유지됩니다.
            </Alert>
          ) : null}

          {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

          {/* Natural-language outcome per implement/analyze step — review steps get their own structured panel in the tabs below. */}
          {summarySteps.map((s) => (
            <Section
              key={s.id}
              label={`${AGENT_LABEL[s.agent]} ${ACTION_LABEL[s.action]} 결과`}
              uppercase={false}
              action={<CopyButton text={s.result?.summary} label="복사" />}
            >
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-secondary">
                {s.result?.summary}
              </p>
            </Section>
          ))}

          <Section label="작업 지시" action={<CopyButton text={task.instruction} label="복사" />}>
            <p
              className={cn(
                "whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-secondary",
                instructionLong && !instructionExpanded && "line-clamp-6",
              )}
            >
              {task.instruction}
            </p>
            {instructionLong ? (
              <button
                type="button"
                onClick={() => setInstructionExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                {instructionExpanded ? (
                  <>
                    접기 <ChevronUp className="h-3 w-3" aria-hidden />
                  </>
                ) : (
                  <>
                    더 보기 <ChevronDown className="h-3 w-3" aria-hidden />
                  </>
                )}
              </button>
            ) : null}
          </Section>

          {isTerminalStatus(task.status) && diffSummary && diffSummary.changedFiles.length > 0 ? (
            <Section label={`변경 파일 ${diffSummary.changedFiles.length}개`}>
              <ul className="mono space-y-1 text-xs text-fg-secondary">
                {diffSummary.changedFiles.slice(0, 6).map((f) => (
                  <li key={f.path} className="break-all">
                    <span className="mr-2 text-fg-muted">{f.status}</span>
                    {f.path}
                  </li>
                ))}
              </ul>
              {diffSummary.changedFiles.length > 6 ? (
                <p className="text-xs text-fg-muted">외 {diffSummary.changedFiles.length - 6}개</p>
              ) : null}
            </Section>
          ) : null}

          <Tabs
            value={detailTab}
            onValueChange={setDetailTab}
            tabs={[
              {
                value: "review",
                label: "리뷰",
                badge:
                  warningIssueCount > 0 ? (
                    <Badge tone="warning" className="ml-0.5">
                      {warningIssueCount}
                    </Badge>
                  ) : undefined,
                content:
                  reviewSteps.length > 0 ? (
                    <div className="space-y-5">
                      {canCompleteAfterReview ? (
                        <Alert tone="brand">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span>
                              {reviewIssueSummary.total > 0
                                ? `지적 사항 ${reviewIssueSummary.total}건을 확인했다면 완료로 처리할 수 있습니다.`
                                : "검토 결과를 확인했다면 완료로 처리할 수 있습니다."}
                            </span>
                            {resolveButton}
                          </div>
                        </Alert>
                      ) : null}
                      {reviewSteps.map((s) => (
                        <ReviewPanel
                          key={s.id}
                          title={`${AGENT_LABEL[s.agent]} 검토`}
                          review={s.result?.review ?? null}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-fg-muted">이 작업에는 리뷰 단계가 없습니다.</p>
                  ),
              },
              {
                value: "diff",
                label: "변경 내용",
                content: <TaskDiffView taskId={id} autoFetchKey={`${task.status}`} />,
              },
              {
                value: "logs",
                label: "실행 로그",
                content: <TaskActivityLog logs={task.logs} />,
              },
            ]}
          />
        </div>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-[4.5rem] lg:self-start">
          <section className="space-y-3">
            <SectionLabel>진행 단계</SectionLabel>
            <WorkflowTimeline workflow={task.workflow} relations={timelineRelations} />
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <SectionLabel>작업 정보</SectionLabel>
            <dl className="space-y-3">
              <Meta label="담당">
                <span className="flex flex-wrap items-center gap-1.5">
                  {agents.map((a) => (
                    <span key={a} className="flex items-center gap-1.5">
                      <AgentAvatar agent={a} size="sm" />
                      {AGENT_LABEL[a]}
                    </span>
                  ))}
                </span>
              </Meta>
              <Meta label="프로젝트">
                <span className="mono block break-all text-xs">{task.projectPath}</span>
              </Meta>
              <Meta label="브랜치">
                <span className="mono block break-all text-xs">
                  {task.branch ?? task.gitInfo?.resolvedBranch ?? "기본 브랜치"}
                </span>
              </Meta>
              <Meta label="생성">
                <span className="text-xs">{formatTime(task.createdAt)}</span>
              </Meta>
              <Meta label="소요 시간">
                <span className="mono text-xs">
                  {formatDuration(task.startedAt, task.completedAt)}
                </span>
              </Meta>
              {securityIssueSummary.level ? (
                <Meta label="Security">
                  <Badge tone={SEVERITY_TONE[securityIssueSummary.level]}>
                    {SEVERITY_LABEL[securityIssueSummary.level]} · {securityIssueSummary.count}건
                  </Badge>
                </Meta>
              ) : null}
            </dl>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmingCancel}
        title={isQueued ? "대기 작업 취소" : "실행 중단"}
        message={
          isQueued
            ? `${task.jobId} 작업을 대기열에서 제거합니다. 아직 실행되지 않았습니다.`
            : `${task.jobId} 작업의 실행을 중단합니다. 진행 중인 프로세스가 종료됩니다.`
        }
        confirmLabel={isQueued ? "대기 취소" : "실행 중단"}
        onConfirm={onCancel}
        onCancel={() => setConfirmingCancel(false)}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title="작업 삭제"
        message={`${task.jobId} "${task.title}"을(를) 삭제합니다. 되돌릴 수 없습니다. Markdown 기록은 남습니다.`}
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
            ? `${task.jobId}: 검토에서 지적 사항 ${reviewIssueSummary.total}건이 나왔습니다` +
              ` (치명적 ${reviewIssueSummary.critical} · 높음 ${reviewIssueSummary.high} · 중간 ${reviewIssueSummary.medium} · 낮음 ${reviewIssueSummary.low}).` +
              ` 내용을 확인했으며 현재 결과를 완료로 처리합니다. 계속할까요?`
            : `${task.jobId}: 검토 결과를 확인했으며 현재 결과를 완료로 처리합니다. 계속할까요?`
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
