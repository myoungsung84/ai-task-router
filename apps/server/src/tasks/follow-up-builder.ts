import type { ReviewIssue, ReviewOutcome, Task } from "@ai-task-router/shared";
import { formatReviewIssuesAsText, securityIssuesOf } from "@ai-task-router/shared";

/**
 * Deterministic signature of a review's issue set — used only for Auto Loop
 * 안전 규칙 #5 ("동일 이슈가 반복되는데 개선되지 않으면 중단"), never shown to a
 * user or an agent. Order-independent (sorted) so the same issue set in a
 * different order still compares equal.
 */
export function reviewIssueSignature(issues: ReviewIssue[]): string {
  return issues
    .map((i) => `${i.severity}|${i.category ?? "OTHER"}|${i.file}|${i.message}`)
    .sort()
    .join("\n");
}

function formatFailedAcceptanceCriteria(review: ReviewOutcome, task: Task): string {
  const failed = (review.acceptanceCriteria ?? []).filter((c) => c.result === "FAIL");
  if (failed.length === 0) return "(FAIL로 판정된 완료 조건 없음)";
  const byId = new Map((task.acceptanceCriteria ?? []).map((c) => [c.id, c.text]));
  return failed
    .map((c) => `- ${c.id}: ${byId.get(c.id) ?? "(원문 없음)"}${c.reason ? ` — ${c.reason}` : ""}`)
    .join("\n");
}

/** Best-effort trailing summary of the Task's most recent implement Step — "직전 구현 결과" for the auto-fix instruction. */
function latestImplementSummary(task: Task): string {
  const implementSteps = task.workflow.steps.filter((s) => s.action === "implement");
  const last = implementSteps[implementSteps.length - 1];
  return last?.result?.summary?.trim() || "(요약 없음)";
}

/**
 * The automatic fix instruction sent to the implementer Agent when the Auto
 * Review/Fix Loop creates a follow-up Task (`auto-fix-service.ts`). Deliberately
 * the server-side twin of the web "후속 작업" prefill
 * (`apps/web/.../follow-up.ts`) — both format issues via the same shared
 * `formatReviewIssuesAsText`, but this one lives in the server because the
 * orchestrator that calls it must never import web-only code.
 */
export function buildAutoFixInstruction(params: {
  task: Task;
  review: ReviewOutcome;
  iterationNumber: number;
  maxReviewLoops: number;
  previousFixInstruction?: string | null;
}): string {
  const { task, review, iterationNumber, maxReviewLoops, previousFixInstruction } = params;
  const securityIssues = securityIssuesOf(review.issues);

  const sections: string[] = [`[원본 작업 지시사항]`, task.instruction, ``];

  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    sections.push(
      `[완료 조건 (Acceptance Criteria)]`,
      ...task.acceptanceCriteria.map((c) => `${c.id}: ${c.text}`),
      ``,
    );
  }

  sections.push(
    `[직전 구현 결과 요약]`,
    latestImplementSummary(task),
    ``,
    `[리뷰에서 발견된 문제 전체]`,
    formatReviewIssuesAsText(review.issues),
    ``,
  );

  if (securityIssues.length > 0) {
    sections.push(`[보안 관련 문제]`, formatReviewIssuesAsText(securityIssues), ``);
  }

  sections.push(`[FAIL로 판정된 완료 조건]`, formatFailedAcceptanceCriteria(review, task), ``);

  if (previousFixInstruction) {
    sections.push(`[직전 자동 수정 시도에서 전달했던 지시사항]`, previousFixInstruction, ``);
  }

  sections.push(
    `[이번 자동 수정 범위]`,
    `이것은 자동 리뷰/수정 루프의 ${String(iterationNumber)}/${String(maxReviewLoops)}번째 자동 수정` +
      ` 시도다. 위 문제와 FAIL로 판정된 완료 조건만 고쳐라 — 관련 없는 새 기능을 추가하거나 범위 밖의` +
      ` 리팩터링을 하지 마라. 수정 후 다시 리뷰가 자동으로 실행된다.`,
  );

  return sections.join("\n");
}
