import type { RoleOverrideMap } from "../components/role-override-panel";
import type { Task, TaskLinkKind, TaskPurpose } from "../types";

export interface FollowUpPrefill {
  projectPath: string;
  instruction: string;
  purpose: TaskPurpose;
  roleOverrides: RoleOverrideMap;
  branch: string | null;
  baseBranch: string | null;
  parentTaskId: string;
  linkKind: TaskLinkKind;
}

/** Best-effort purpose a stored Task's Workflow was actually built for — used only to prefill a follow-up's purpose picker with something sensible, never to reinterpret history. */
function inferPurpose(task: Task): TaskPurpose {
  const actions = new Set(task.workflow.steps.map((s) => s.action));
  if (actions.has("implement")) return "implement";
  if (actions.has("analyze")) return "analyze";
  return "review";
}

/** Carries the exact Agent/model each Role used in the original Task forward as this follow-up's overrides, so a follow-up never silently switches agents just because Settings' defaults changed since. */
function overridesFromWorkflow(task: Task): RoleOverrideMap {
  const overrides: RoleOverrideMap = {};
  for (const step of task.workflow.steps) {
    const role =
      step.action === "implement"
        ? "implementer"
        : step.action === "analyze"
          ? "analyzer"
          : "reviewer";
    if (!overrides[role]) overrides[role] = { agent: step.agent, model: step.model ?? null };
  }
  return overrides;
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
  const shared = {
    projectPath: task.projectPath,
    branch: task.branch,
    baseBranch: task.baseBranch,
    parentTaskId: task.id,
    roleOverrides: overridesFromWorkflow(task),
  };

  if (kind === "fix_and_rereview") {
    return {
      ...shared,
      purpose: "implement",
      instruction: [
        "[원본 작업 지시사항]",
        task.instruction,
        "",
        "[리뷰에서 발견된 문제]",
        formatIssues(task),
        "",
        "위 문제를 수정하고 다시 검토하라.",
      ].join("\n"),
      linkKind: "fix_and_rereview",
    };
  }

  if (kind === "review_only") {
    return {
      ...shared,
      purpose: "review",
      instruction: [
        "[원본 작업 지시사항]",
        task.instruction,
        "",
        "코드가 이미 수정되었을 수 있습니다. 현재 working tree 변경사항을 다시 검토하라.",
      ].join("\n"),
      linkKind: "review_only",
    };
  }

  // rerun — exact same instruction/purpose, just a fresh attempt.
  return {
    ...shared,
    purpose: inferPurpose(task),
    instruction: task.instruction,
    linkKind: "rerun",
  };
}
