import type { Task, TaskLinkKind, WorkflowStepSpec } from "../types";

export interface FollowUpPrefill {
  title: string;
  projectPath: string;
  instruction: string;
  workflowSteps: WorkflowStepSpec[];
  branch: string | null;
  baseBranch: string | null;
  parentTaskId: string;
  linkKind: TaskLinkKind;
}

function toSpec(task: Task): WorkflowStepSpec[] {
  return task.workflow.steps.map((s) => ({
    agent: s.agent,
    action: s.action,
    permission: s.permission,
  }));
}

function formatIssues(task: Task): string {
  const issues = task.workflow.steps.flatMap((s) => s.result?.review?.issues ?? []);
  if (issues.length === 0) {
    return "(세부 이슈 없음 — 리뷰 실행 자체가 실패했을 수 있습니다. 로그를 확인하세요.)";
  }
  return issues
    .map((i) => {
      const where = [i.file, i.location].filter(Boolean).join(":");
      const suggestion = i.suggestion ? ` (제안: ${i.suggestion})` : "";
      return `- [${i.severity}] ${where ? `${where}: ` : ""}${i.message}${suggestion}`;
    })
    .join("\n");
}

/**
 * Builds the pre-filled New Task form data for a WARNING follow-up — the
 * user still reviews/edits this in the dialog before it's actually created
 * (see NewTaskModal's `prefill` prop), this just computes a sensible
 * starting point per follow-up kind.
 */
export function buildFollowUpPrefill(task: Task, kind: TaskLinkKind): FollowUpPrefill {
  const specSteps = toSpec(task);
  const shared = {
    projectPath: task.projectPath,
    branch: task.branch,
    baseBranch: task.baseBranch,
    parentTaskId: task.id,
  };

  if (kind === "fix_and_rereview") {
    return {
      ...shared,
      title: `${task.title} — 리뷰 수정`,
      instruction: [
        "[원본 작업 지시사항]",
        task.instruction,
        "",
        "[리뷰에서 발견된 문제]",
        formatIssues(task),
        "",
        "위 문제를 수정하고 다시 검토하라.",
      ].join("\n"),
      workflowSteps: specSteps,
      linkKind: "fix_and_rereview",
    };
  }

  if (kind === "review_only") {
    const reviewOnlySteps = specSteps.filter((s) => s.action === "review");
    return {
      ...shared,
      title: `${task.title} — 재검토`,
      instruction: [
        "[원본 작업 지시사항]",
        task.instruction,
        "",
        "코드가 이미 수정되었을 수 있습니다. 현재 working tree 변경사항을 다시 검토하라.",
      ].join("\n"),
      workflowSteps: reviewOnlySteps.length > 0 ? reviewOnlySteps : specSteps,
      linkKind: "review_only",
    };
  }

  // rerun — exact same instruction/workflow, just a fresh attempt.
  return {
    ...shared,
    title: task.title,
    instruction: task.instruction,
    workflowSteps: specSteps,
    linkKind: "rerun",
  };
}
