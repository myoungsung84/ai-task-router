import type { AgentName, StepAction, StepStatus, TaskStatus } from "./types";

export const AGENT_LABEL: Record<AgentName, string> = { claude: "Claude", codex: "Codex" };
export const AGENT_ICON: Record<AgentName, string> = { claude: "🤖", codex: "🔍" };

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
