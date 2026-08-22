import type { DailySummary, Task } from "@ai-task-router/shared";
import { securityReviewLevelOf } from "@ai-task-router/shared";
import { taskStore } from "../tasks/task-store";

/** `YYYY-MM-DD` in Asia/Seoul, regardless of the server's own timezone — the same technique `task-copy-text.ts`'s `formatKst` uses, kept independent since that one formats a full timestamp and this only needs the calendar date. */
function kstDateOf(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's date, `YYYY-MM-DD`, Asia/Seoul — the default when a caller doesn't specify one. */
export function todayInKst(): string {
  return kstDateOf(new Date().toISOString());
}

/**
 * Aggregates every Task created on `date` (Asia/Seoul calendar day) into one
 * Daily Summary — computed fresh on every call from `taskStore.list()` (no
 * separate history store to keep in sync), which is cheap enough for a
 * dashboard-refresh cadence at this project's scale.
 */
export function computeDailySummary(date: string): DailySummary {
  const tasksToday = taskStore.list().filter((t) => kstDateOf(t.createdAt) === date);

  let completed = 0;
  let needsAttention = 0;
  let failed = 0;
  let claudeRuns = 0;
  let codexReviews = 0;
  let securityHigh = 0;
  let securityCritical = 0;
  let autoFixRuns = 0;
  let changedFilesCount = 0;
  let totalDurationMs = 0;
  let hasDuration = false;

  for (const task of tasksToday) {
    if (task.status === "READY") completed += 1;
    else if (task.status === "WARNING") needsAttention += 1;
    else if (task.status === "FAILED") failed += 1;

    for (const step of task.workflow.steps) {
      const ran = step.status === "SUCCESS" || step.status === "FAILED";
      if (!ran) continue;
      if (step.agent === "claude") claudeRuns += 1;
      if (step.action === "review" && step.agent === "codex") codexReviews += 1;
    }

    const reviewIssues = task.workflow.steps.flatMap((s) => s.result?.review?.issues ?? []);
    const securityLevel = securityReviewLevelOf(reviewIssues);
    if (securityLevel === "critical") securityCritical += 1;
    else if (securityLevel === "high") securityHigh += 1;

    if ((task.reviewLoopCount ?? 0) > 0) autoFixRuns += 1;
    if (typeof task.changedFilesCount === "number") changedFilesCount += task.changedFilesCount;

    if (task.startedAt && task.completedAt) {
      const ms = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
      if (ms >= 0) {
        totalDurationMs += ms;
        hasDuration = true;
      }
    }
  }

  const tasks = tasksToday.map(taskRef);

  return {
    date,
    totalTasks: tasksToday.length,
    completed,
    needsAttention,
    failed,
    claudeRuns,
    codexReviews,
    securityHigh,
    securityCritical,
    autoFixRuns,
    changedFilesCount,
    totalDurationMs: hasDuration ? totalDurationMs : null,
    tasks,
    narrativeSummary: buildNarrativeSummary({
      totalTasks: tasksToday.length,
      completed,
      needsAttention,
      failed,
      securityHigh,
      securityCritical,
      autoFixRuns,
    }),
  };
}

function taskRef(task: Task): DailySummary["tasks"][number] {
  return {
    jobId: task.jobId,
    title: task.title,
    status: task.status,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
  };
}

/** Deterministic (non-AI) Korean sentence — every clause is conditional so a quiet day never reads a padded-out "0건" list. */
function buildNarrativeSummary(counts: {
  totalTasks: number;
  completed: number;
  needsAttention: number;
  failed: number;
  securityHigh: number;
  securityCritical: number;
  autoFixRuns: number;
}): string {
  if (counts.totalTasks === 0) return "오늘 생성된 Task가 없습니다.";

  const clauses: string[] = [
    `오늘 Task ${String(counts.totalTasks)}건 중 완료 ${String(counts.completed)}건`,
  ];
  if (counts.needsAttention > 0) clauses.push(`확인 필요 ${String(counts.needsAttention)}건`);
  if (counts.failed > 0) clauses.push(`실패 ${String(counts.failed)}건`);

  const extra: string[] = [];
  if (counts.securityCritical > 0)
    extra.push(`Security Critical ${String(counts.securityCritical)}건`);
  if (counts.securityHigh > 0) extra.push(`Security High ${String(counts.securityHigh)}건`);
  if (counts.autoFixRuns > 0) extra.push(`자동 수정 ${String(counts.autoFixRuns)}건`);

  const main = `${clauses.join(", ")}입니다.`;
  return extra.length > 0 ? `${main} ${extra.join(", ")}이 있었습니다.` : main;
}
