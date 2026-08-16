import type {
  AgentName,
  ReviewIssueSeverity,
  StepAction,
  StepStatus,
  Task,
  TaskLinkKind,
  TaskListItem,
  TaskPurpose,
  TaskRole,
  TaskStatus,
} from "./types";

export const AGENT_LABEL: Record<AgentName, string> = { claude: "Claude", codex: "Codex" };

/** One short line next to the AI's name in a picker — kept to a noun phrase of roughly equal length for both, so neither option looks like the annotated/default one. */
export const AGENT_BLURB: Record<AgentName, string> = {
  claude: "구현과 분석에 강점",
  codex: "코드 리뷰에 강점",
};

export const TASK_ROLE_LABEL: Record<TaskRole, string> = {
  implementer: "구현 담당",
  analyzer: "분석 담당",
  reviewer: "리뷰 담당",
};

export const TASK_ROLE_DESCRIPTION: Record<TaskRole, string> = {
  implementer: "코드를 직접 작성·수정",
  analyzer: "코드 변경 없이 읽기 전용 조사",
  reviewer: "코드 변경 없이 읽기 전용 검토",
};

export const TASK_PURPOSE_LABEL: Record<TaskPurpose, string> = {
  implement: "구현",
  analyze: "분석",
  review: "리뷰",
};

// Deliberately the same shape and near-identical length — these three sit
// side by side as equal-size options, and a description that runs longer
// than its siblings makes that one option visibly taller.
export const TASK_PURPOSE_DESCRIPTION: Record<TaskPurpose, string> = {
  implement: "코드를 변경합니다. 구현 완료 후 리뷰 실행.",
  analyze: "코드를 변경하지 않습니다. 읽기 전용 조사.",
  review: "코드를 변경하지 않습니다. 읽기 전용 검토.",
};

export const LINK_KIND_LABEL: Record<TaskLinkKind, string> = {
  fix_and_rereview: "리뷰 수정",
  review_only: "재검토",
  rerun: "재실행",
};

export const SEVERITY_LABEL: Record<ReviewIssueSeverity, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

export const ACTION_LABEL: Record<StepAction, string> = {
  implement: "구현",
  analyze: "분석",
  review: "리뷰",
};

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  PENDING: "대기",
  RUNNING: "진행 중",
  SUCCESS: "완료",
  SKIPPED: "건너뜀",
  FAILED: "실패",
  CANCELLED: "취소",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  QUEUED: "대기중",
  RUNNING: "실행 중",
  REVIEWING: "리뷰 중",
  READY: "완료",
  WARNING: "확인 필요",
  FAILED: "실패",
  CANCELLED: "취소됨",
};

/**
 * The one short phrase describing where a Task stands right now — shown on
 * Home's rows and the Task Detail hero. Deliberately *not* a restatement of
 * the status badge sitting next to it: for an active Task it names who is
 * doing what, and for a finished one it names the outcome. Neutral product
 * copy, no conversational endings — the screen is a workspace, not a chat.
 */
export function taskActivityPhrase(task: Task | TaskListItem): string {
  const runningStep = task.workflow.steps.find((s) => s.status === "RUNNING");
  switch (task.status) {
    case "QUEUED":
      return "실행 대기";
    case "RUNNING":
      return runningStep
        ? `${AGENT_LABEL[runningStep.agent]} ${ACTION_LABEL[runningStep.action]} 중`
        : "실행 중";
    case "REVIEWING": {
      const reviewSteps = task.workflow.steps.filter((s) => s.action === "review");
      const reviewer = runningStep ?? reviewSteps[reviewSteps.length - 1];
      return reviewer ? `${AGENT_LABEL[reviewer.agent]} 검토 중` : "검토 중";
    }
    case "READY":
      return "지적 사항 없음";
    case "WARNING":
      return "검토 지적 사항 있음";
    case "FAILED":
      return "실행 실패";
    case "CANCELLED":
      return "실행 취소됨";
  }
}
