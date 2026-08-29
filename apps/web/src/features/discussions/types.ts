import type { ComposeStage, DiscussionStatus } from "@ai-task-router/shared";

/**
 * Display strings for the discussion room.
 *
 * The shapes and the turn rules moved to `@ai-task-router/shared` once the
 * server started running the same rounds — a rule about who may speak cannot
 * have two copies. What stays here is only what is about showing them, which
 * the server has no opinion on.
 */

export const COMPOSE_STAGE_LABEL: Record<ComposeStage, string> = {
  reading: "문서 읽음",
  reviewing: "검토",
  recording: "기록",
  verifying: "버전 확인",
  posting: "요약 게시",
};

export const DISCUSSION_STATUS_LABEL: Record<DiscussionStatus, string> = {
  active: "진행 중",
  mediating: "조율 중",
  closed: "종료",
};
