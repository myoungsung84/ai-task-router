import {
  AGENT_LABEL,
  ACTION_LABEL,
  LINK_KIND_LABEL,
  STEP_STATUS_LABEL,
  TASK_STATUS_LABEL,
} from "../workflow-labels";
import { securityReviewLevelOf } from "../types";
import type { ChangedFile, ReviewOutcome, Task, TaskLinkKind } from "../types";

/** Plain-text rendering of one review Step's outcome — used by the review panel's own copy button. */
export function reviewOutcomeToText(review: ReviewOutcome): string {
  const lines = [`결과: ${review.result}`];
  if (review.issues.length === 0) {
    lines.push("발견된 문제 없음");
  } else {
    lines.push(`발견된 문제 ${review.issues.length}건:`);
    for (const issue of review.issues) {
      const where = [issue.file, issue.location].filter(Boolean).join(":");
      lines.push(`- [${issue.severity}] ${where ? `${where}: ` : ""}${issue.message}`);
      if (issue.suggestion) lines.push(`  제안: ${issue.suggestion}`);
    }
  }
  return lines.join("\n");
}

/**
 * Assembles a single copy-pasteable text block for a Task — only sections
 * that actually have content are included, so "전체 복사" never pastes a
 * wall of empty labels.
 */
export function taskToCopyText(task: Task): string {
  const sections: string[] = [];

  sections.push(
    [
      `${task.jobId} — ${task.title}`,
      `상태: ${TASK_STATUS_LABEL[task.status]}`,
      `프로젝트: ${task.projectPath}`,
      task.branch ? `브랜치: ${task.branch}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  sections.push(`[원문 지시서]\n${task.instruction}`);

  for (const step of task.workflow.steps) {
    if (step.result?.summary) {
      sections.push(
        `[${AGENT_LABEL[step.agent]} ${ACTION_LABEL[step.action]} 결과 요약]\n${step.result.summary}`,
      );
    }
    if (step.result?.review) {
      sections.push(
        `[${AGENT_LABEL[step.agent]} 리뷰 결과]\n${reviewOutcomeToText(step.result.review)}`,
      );
    }
    if (step.error) {
      sections.push(
        `[${AGENT_LABEL[step.agent]} ${ACTION_LABEL[step.action]} 오류]\n${step.error}`,
      );
    }
  }

  if (task.error) {
    sections.push(`[오류]\n${task.error}`);
  }

  return sections.join("\n\n");
}

/** One related Task as needed for the "관련 Task" section below — resolved by the caller (task-detail.tsx already walks parentTaskId/children for its own breadcrumb), never fetched here. */
export interface RelatedTaskForCopy {
  jobId: string;
  linkKind: TaskLinkKind | null;
}

/** Everything about a Task's surroundings that this module cannot derive from `Task` alone — all optional, and each piece is only rendered when actually provided. */
export interface AiHandoffContext {
  parent?: RelatedTaskForCopy | null;
  children?: RelatedTaskForCopy[];
  changedFiles?: ChangedFile[];
}

/**
 * `YYYY-MM-DD HH:mm KST` — always Asia/Seoul regardless of the viewer's own
 * timezone/locale, since this string is meant to be pasted into a *different*
 * AI's chat window verbatim; a locale-formatted timestamp (`toLocaleString`)
 * would render differently depending on where it's read, which defeats the
 * point of a context block meant to be understood exactly as written.
 */
function formatKst(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} KST`;
}

/** "M telegram-client.ts" style, same shape as TaskDiffView's own file list — kept to a handful of lines so the handoff text stays scannable rather than pasting an entire file list wholesale. */
const CHANGED_FILES_PREVIEW_LIMIT = 20;

/**
 * The "AI 전달용 복사" builder — a self-contained context block meant to be
 * pasted as the first message of a *different* AI conversation (ChatGPT, a
 * fresh Claude/Codex chat, …) so that assistant can pick up this Task's
 * context without the user re-typing it. Deliberately not addressed to any
 * one AI by name.
 *
 * Every section is optional and omitted entirely when there is nothing to
 * put in it — this only ever writes down data that actually exists on
 * `task` or was explicitly passed in via `context`; it never invents a
 * `workflowId` or any other field this codebase doesn't actually store.
 */
export function taskToAiHandoffText(task: Task, context: AiHandoffContext = {}): string {
  const lines: string[] = ["[AI Task Router 작업 전달]"];

  lines.push(`Task ID: ${task.jobId}`);
  lines.push(`상태: ${TASK_STATUS_LABEL[task.status]}`);
  lines.push(`프로젝트: ${task.projectPath}`);
  if (task.branch) lines.push(`브랜치: ${task.branch}`);
  const createdKst = formatKst(task.createdAt);
  if (createdKst) lines.push(`생성일시: ${createdKst}`);
  const completedKst = formatKst(task.completedAt);
  if (completedKst) lines.push(`완료일시: ${completedKst}`);

  lines.push("", "작업 제목:", task.title);
  lines.push("", "작업 내용:", task.instruction);

  const stepLines = task.workflow.steps.map((s) => {
    const suffix = s.skipReason ? ` (${s.skipReason === "NO_CHANGES" ? "변경 없음" : "레거시"})` : "";
    let line = `- ${AGENT_LABEL[s.agent]} ${ACTION_LABEL[s.action]} ${STEP_STATUS_LABEL[s.status]}${suffix}`;
    if (s.result?.review) {
      line += `: ${s.result.review.result}${s.result.review.issues.length ? ` (지적 ${s.result.review.issues.length}건)` : ""}`;
    }
    return line;
  });
  if (stepLines.length > 0) {
    lines.push("", "현재 진행 상태:", ...stepLines);
  }

  const summarySteps = task.workflow.steps.filter((s) => s.action !== "review" && s.result?.summary);
  for (const s of summarySteps) {
    lines.push("", `${AGENT_LABEL[s.agent]} ${ACTION_LABEL[s.action]} 결과 요약:`, s.result!.summary!);
  }

  const reviewSteps = task.workflow.steps.filter((s) => s.result?.review);
  for (const s of reviewSteps) {
    lines.push("", `${AGENT_LABEL[s.agent]} 리뷰 요약:`, reviewOutcomeToText(s.result!.review!));
  }

  // Security Review — a dedicated, easy-to-spot section on top of the
  // per-step review summaries above (which already list every Issue,
  // Security ones included, inline) so a receiving AI can't miss a real
  // Security finding buried in a longer review. Omitted entirely when there
  // is nothing categorized "SECURITY" — a stored/parse-failure Issue with
  // no category (or explicitly "OTHER") never lands in this section.
  const securityIssues = task.workflow.steps
    .flatMap((s) => s.result?.review?.issues ?? [])
    .filter((i) => i.category === "SECURITY");
  if (securityIssues.length > 0) {
    const level = securityReviewLevelOf(securityIssues);
    lines.push(
      "",
      level === "critical" ? "Security Review (CRITICAL 포함):" : "Security Review:",
    );
    for (const issue of securityIssues) {
      const where = [issue.file, issue.location].filter(Boolean).join(":");
      lines.push(`- ${issue.severity.toUpperCase()}: ${where ? `${where}: ` : ""}${issue.message}`);
    }
  }

  if (task.error) {
    lines.push("", "오류:", task.error);
  }

  const changedFiles = context.changedFiles ?? [];
  if (changedFiles.length > 0) {
    lines.push("", `변경 파일 (${changedFiles.length}개):`);
    for (const f of changedFiles.slice(0, CHANGED_FILES_PREVIEW_LIMIT)) {
      lines.push(`- ${f.status} ${f.path}`);
    }
    if (changedFiles.length > CHANGED_FILES_PREVIEW_LIMIT) {
      lines.push(`- 외 ${changedFiles.length - CHANGED_FILES_PREVIEW_LIMIT}개`);
    }
  }

  const relatedLines: string[] = [];
  if (context.parent) {
    relatedLines.push(`- 부모 Task: ${context.parent.jobId}`);
  }
  if (context.children && context.children.length > 0) {
    relatedLines.push(`- 후속 Task: ${context.children.map((c) => c.jobId).join(", ")}`);
  }
  // linkKind describes *this* Task's relationship to its parent — shown once
  // here rather than per-child, matching what the field actually means.
  if (task.linkKind) {
    relatedLines.push(`- 관계: ${task.linkKind} (${LINK_KIND_LABEL[task.linkKind]})`);
  }
  if (relatedLines.length > 0) {
    lines.push("", "관련 Task:", ...relatedLines);
  }

  lines.push("", "위 내용을 현재 작업 맥락으로 이해하고 이어서 답변해줘.");

  return lines.join("\n");
}
