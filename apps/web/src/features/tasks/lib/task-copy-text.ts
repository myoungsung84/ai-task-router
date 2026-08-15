import { AGENT_LABEL, ACTION_LABEL, TASK_STATUS_LABEL } from "../workflow-labels";
import type { ReviewOutcome, Task } from "../types";

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
