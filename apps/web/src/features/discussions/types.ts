import type { AgentName } from "@/features/tasks/types";

/**
 * Shapes for the discussion room, kept in the web app for now because nothing
 * server-side produces them yet — this is the mock-data pass of the UX draft
 * (docs/discussion-room-ux.md). When the append-only document store lands
 * these move to packages/shared like the Task types did.
 */

/** 진행 중 / 조율 중 / 종료 — the proposal's §5 document states. */
export type DiscussionStatus = "active" | "mediating" | "closed";

/**
 * What a participant is doing, drawn on the character rather than written
 * beside it.
 *
 * `holding` is 입장 유지 (§2 무한 논의 방지) and is the reason this is a
 * participant state at all rather than a message type. Posting "Codex: 입장
 * 유지" into the stream would let the rule against repeating an argument fill
 * the room with repetitions of that very fact; carried on the character it
 * stays visible, stays quiet, and clears the moment new evidence arrives.
 */
export type ParticipantState = "idle" | "reading" | "writing" | "holding";

/**
 * The proposal's §7, which fixes the order of a single AI's turn: read the
 * document, review what is in it, record the detail, confirm the version, then
 * post the summary. Five stages, always the same five, which is what lets them
 * be drawn as milestones instead of a percentage.
 */
export type ComposeStage = "reading" | "reviewing" | "recording" | "verifying" | "posting";

export const COMPOSE_STAGES: ComposeStage[] = [
  "reading",
  "reviewing",
  "recording",
  "verifying",
  "posting",
];

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

export interface Participant {
  agent: AgentName;
  state: ParticipantState;
  /** Why the character is holding — shown on hover, never as a message. */
  holdingSince?: string;
}

export interface DiscussionMessage {
  id: string;
  /** "user" or an AI. The user is a participant like any other in the stream. */
  author: "user" | AgentName;
  at: string;
  /**
   * Conclusion first, then at most two lines of grounds. Deliberately tighter
   * than the proposal's 3~5줄: the longer this is, the more a reader decides
   * from the chat, and the document stops being the single basis it is
   * supposed to be (§2).
   */
  body: string;
  /** Anchor into the append-only document — `상세 #47`. Stable forever, because entries are only ever appended. */
  entryRef: number | null;
  /** Code or document paths the entry cites (§2 관련 코드·파일·검증 결과). */
  sources?: string[];
  /** The author later corrected this. The message stays where it is (§8); it just goes quiet and points forward. */
  amendedBy?: string;
}

/** The latest 요약 block in the document — the only one the rail renders. */
export interface DiscussionSummary {
  facts: string[];
  agreed: string[];
  open: string[];
  decisions: string[];
}

/**
 * What an AI would say on its next turn, written by hand.
 *
 * The screen needs to run rounds before any agent can actually be asked, and
 * the one thing it cannot invent is the judgment behind gate 2 — whether this
 * participant has new grounds. So each room carries a queue per agent: the
 * turn engine still decides who is asked and in what order, and this only
 * answers "and do they have anything". Runs out into silence, which is the
 * honest default.
 */
export interface ScriptedTurn {
  /** Gate 2's input. False means the character flips to 입장 유지. */
  grounds: boolean;
  body?: string;
  sources?: string[];
  // No entryRef: anchors are assigned by the document as entries are appended,
  // never chosen by the writer, or a hand-edited script could hand the same
  // number to two entries and quietly break every link pointing at it.
}

export interface Discussion {
  id: string;
  title: string;
  status: DiscussionStatus;
  /**
   * Three numbers, never one.
   *
   * A first pass used a single `version` for all of it, which reads fine until
   * each job pulls in a different direction: `revision` has to change on every
   * append or it cannot detect a conflict, `entryRef` must never change or the
   * anchors in old messages rot, and `summaryVersion` should change only when
   * the summary does or the rail flickers on writes that did not touch it.
   * Sharing a counter forces two of the three to be wrong.
   */
  /** Bumped by every append. What an AI compares against before it writes (§7 4단계). */
  revision: number;
  /** The last 요약 block's number — what the document rail shows. */
  summaryVersion: number;
  /** Highest 상세 의견 entry appended. Entry numbers are permanent anchors and are never reused. */
  lastEntryRef: number;
  createdAt: string;
  updatedAt: string;
  /** Registered repositories (§4). Read-only investigation scope, never written to. */
  repos: string[];
  participants: Participant[];
  summary: DiscussionSummary;
  messages: DiscussionMessage[];
  /** Set while one AI is mid-turn; drives the compose rail. Null once posted. */
  composing: { agent: AgentName; stage: ComposeStage } | null;
  /** Rounds run so far — the first one is the parallel one. */
  round: number;
  /** Who spoke in the last completed round, for the default ordering. */
  lastSpeakers: AgentName[];
  /** Hand-written answers to gate 2, consumed as rounds run. */
  script: Partial<Record<AgentName, ScriptedTurn[]>>;
}
