import type { Tone } from "@/components/badge";
import { securityReviewLevelOf } from "./types";
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
  critical: "치명적",
  high: "높음",
  medium: "중간",
  low: "낮음",
};

/** Severity → Badge tone, centralized so ReviewPanel/task-detail/task-row never re-decide "high/critical looks dangerous" on their own. Only `danger`/`warning`/`neutral` exist as tones here — critical reuses `danger` (no dedicated tone) but is always paired with its own text label, so it never reads the same as a plain high. */
export const SEVERITY_TONE: Record<ReviewIssueSeverity, Tone> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
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

/**
 * Why a Task sits in the "확인 필요" (attention) group — derived purely from
 * data already on the Task, never guessed. Only WARNING/FAILED ever produce
 * a reason; every other status is `null` (안 확인해도 되는 Task).
 *
 * Deliberately a closed union rather than a free-form string: this is the
 * one place that reads `workflow.steps[]` to tell "리뷰가 지적했다" apart
 * from "리뷰 실행 자체가 실패했다" apart from "구현/분석이 실패했다" apart
 * from "리뷰가 Security HIGH/CRITICAL 이슈를 지적했다", so a new reason that
 * later becomes derivable from real data gets added as one more case here —
 * not as a new `if` scattered across task-row.tsx / task-detail.tsx /
 * task-list.tsx. `SECURITY_CRITICAL`/`SECURITY_HIGH` are two flat variants
 * rather than one `SECURITY_ISSUE` + severity pair, matching how every other
 * reason here is already its own case — every caller keyed on
 * `AttentionReason` (the tone/order Records below, task-row.tsx,
 * task-list.tsx) stays a plain `Record<AttentionReason, …>` instead of
 * switching shape for one case.
 */
export type AttentionReason =
  | "EXECUTION_FAILED"
  | "SECURITY_CRITICAL"
  | "SECURITY_HIGH"
  | "REVIEW_LOOP_EXCEEDED"
  | "REQUIREMENT_CLARIFICATION"
  | "REVIEW_FAILED"
  | "REVIEW_NEEDS_FIX";

export const ATTENTION_REASON_LABEL: Record<AttentionReason, string> = {
  EXECUTION_FAILED: "실행 실패",
  // Left as the English proper-noun form ("Security Critical/High") rather
  // than translated — this codebase already shows review outcomes as literal
  // PASS/WARNING (see review-panel.tsx), and unambiguously names the same
  // Issue category a Security-conscious reader of the AI handoff copy sees.
  SECURITY_CRITICAL: "Security Critical",
  SECURITY_HIGH: "Security High",
  REVIEW_LOOP_EXCEEDED: "자동 수정 한도 초과",
  REQUIREMENT_CLARIFICATION: "요구사항 확인 필요",
  REVIEW_FAILED: "리뷰 실행 실패",
  REVIEW_NEEDS_FIX: "리뷰 수정 필요",
};

export function attentionReasonOf(task: Task | TaskListItem): AttentionReason | null {
  if (task.status === "FAILED") return "EXECUTION_FAILED";
  if (task.status !== "WARNING") return null;

  const reviewSteps = task.workflow.steps.filter((s) => s.action === "review");

  // A HIGH/CRITICAL Security finding outranks every other reason below — the
  // whole point of surfacing Security separately is that a real,
  // already-reported vulnerability must never read as an ordinary review
  // nitpick. Computed from the Issues any review Step that actually produced
  // a result reported (a FAILED review Step contributes no issues here, so it
  // never masks a Security finding another step did produce — and a
  // parse-failure fallback Issue never masquerades as one either, since it's
  // always `category: "OTHER"`, not `"SECURITY"`).
  const issues = reviewSteps.flatMap((s) => s.result?.review?.issues ?? []);
  const securityLevel = securityReviewLevelOf(issues);
  if (securityLevel === "critical") return "SECURITY_CRITICAL";
  if (securityLevel === "high") return "SECURITY_HIGH";

  // Set once, authoritatively, by the server's own Auto Fix orchestrator when
  // this WARNING Task's chain has already used up Settings.maxReviewLoops
  // automatic attempts — read directly rather than re-deriving the threshold
  // comparison here (see shared `autoFixBlockReasonOf`/`Task.reviewLoopExceeded`).
  if (task.reviewLoopExceeded === true) return "REVIEW_LOOP_EXCEEDED";

  // The reviewing agent's own explicit signal that a human decision is
  // needed — never inferred from message text (see `ReviewOutcome.needsClarification`).
  const reviewResults = reviewSteps
    .map((s) => s.result?.review)
    .filter((r): r is NonNullable<typeof r> => !!r);
  if (reviewResults.some((r) => r.needsClarification === true)) return "REQUIREMENT_CLARIFICATION";

  // A review Step whose own run failed (CLI error / unparseable output) is a
  // different situation from a review Step that ran fine and reported real
  // issues — the former means "이 결과를 신뢰할 수 없다", the latter means
  // "고칠 것이 있다". Prefer REVIEW_FAILED whenever any review Step is in
  // that state, even if another review Step in the same Task did produce a
  // usable WARNING result.
  if (reviewSteps.some((s) => s.status === "FAILED")) return "REVIEW_FAILED";

  return "REVIEW_NEEDS_FIX";
}
