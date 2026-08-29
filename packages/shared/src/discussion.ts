import type { AgentName } from "./types";

/**
 * The discussion room's shared shapes.
 *
 * A discussion is not a Task and deliberately shares nothing with one but the
 * agent names: Tasks run somewhere and produce a diff, discussions produce a
 * record and are forbidden from touching the repositories they talk about.
 *
 * The document itself is an append-only markdown file — see
 * docs/discussion-room-ux.md §6. Everything below is what a reader gets after
 * that log has been folded up: the latest summary, the messages in order, and
 * the three counters that say where the log stands.
 */

/** 진행 중 / 조율 중 / 종료. */
export type DiscussionStatus = "active" | "mediating" | "closed";

export const DISCUSSION_STATUSES: DiscussionStatus[] = ["active", "mediating", "closed"];

/**
 * What a participant is doing, drawn on the character rather than written
 * beside it.
 *
 * `holding` is 입장 유지: an AI that has run out of new grounds holds its
 * position instead of restating it. It is a participant state and never a
 * message, because posting it would let the rule against repeating an argument
 * fill the room with repetitions of that fact.
 */
export type ParticipantState = "idle" | "reading" | "writing" | "holding";

export interface Participant {
  agent: AgentName;
  state: ParticipantState;
  /** When the hold began — shown on hover, never posted. */
  holdingSince?: string | null;
}

/** One AI's turn, in the fixed order the proposal gives it. */
export type ComposeStage = "reading" | "reviewing" | "recording" | "verifying" | "posting";

export const COMPOSE_STAGES: ComposeStage[] = [
  "reading",
  "reviewing",
  "recording",
  "verifying",
  "posting",
];

export interface DiscussionMessage {
  id: string;
  /** The user is a participant like any other in the stream. */
  author: "user" | AgentName;
  at: string;
  /**
   * Conclusion first, then at most a couple of lines of grounds. Kept tight on
   * purpose: the more a reader can decide from the chat, the less the document
   * is the single basis it is supposed to be.
   */
  body: string;
  /**
   * Anchor into the append-only document. Permanent — entries are only ever
   * appended, so a link written today still points at the right paragraph a
   * hundred appends later. Null for the user's own messages, which are
   * recorded as 의견/결정 rather than as numbered entries.
   */
  entryRef: number | null;
  /** Paths the entry cites. */
  sources?: string[];
  /** Set when the author later corrected this. The message stays put; it goes quiet and points forward. */
  amendedBy?: string;
}

/** The latest 요약 block — the only one anything renders. */
export interface DiscussionSummary {
  facts: string[];
  agreed: string[];
  open: string[];
  decisions: string[];
}

export const EMPTY_SUMMARY: DiscussionSummary = { facts: [], agreed: [], open: [], decisions: [] };

export interface Discussion {
  id: string;
  /** Short human-facing id, e.g. D-3. */
  roomId: string;
  title: string;
  status: DiscussionStatus;

  /**
   * Three counters, never one. A first pass shared a single `version` and each
   * job pulled a different way: conflict detection has to change on every
   * append, an anchor must never change or old links rot, and a summary number
   * should move only when the summary does.
   */
  /** Bumped by every append. What a writer compares against before it writes. */
  revision: number;
  /** The last 요약 block's number. */
  summaryVersion: number;
  /** Highest 상세 의견 entry appended. Never reused. */
  lastEntryRef: number;

  createdAt: string;
  updatedAt: string;

  /**
   * Registered repositories — the AIs' read-only investigation scope, and part
   * of the subject rather than a filing detail. A discussion usually exists
   * because of how several places relate, so there is no primary one.
   */
  repos: string[];
  participants: Participant[];
  summary: DiscussionSummary;
  messages: DiscussionMessage[];

  /** Rounds completed. The first one is the parallel one. */
  round: number;
  /** Who spoke in the last completed round, for the default ordering. */
  lastSpeakers: AgentName[];
}

/** List view — everything but the message history. */
export type DiscussionListItem = Omit<Discussion, "messages">;

/**
 * A round in flight, held in memory only.
 *
 * Deliberately not in the document: the document is a record and this is
 * scheduling. A restart drops it and hands control back to the user, which is
 * the same call `recover-interrupted.ts` makes for Tasks — but only the queue
 * can be dropped that cheaply. Anything already appended is permanent, which
 * is what `idemKey` on each entry is for.
 */
export interface RoundState {
  roundId: string;
  round: number;
  parallel: boolean;
  /** Still to act, in order. */
  queue: AgentName[];
  /**
   * Who has fetched the document for this round.
   *
   * The only progress signal the Router honestly has. How far through its own
   * reasoning an agent is, it alone knows; that it has asked for the document
   * is observable, and it is the one stage worth showing because it is the
   * proposal's first rule made visible — an answer comes from the record, not
   * from the chat above it.
   */
  claimed: AgentName[];
  /** Gate 2 is skipped for these — the user asked them directly. */
  addressed: AgentName[];
  /** Why this order, so it never looks arbitrary. */
  reason: string;
  startedAt: string;
}

export interface DiscussionTurnView {
  /** Null when no round is open — the room is waiting on the user. */
  round: RoundState | null;
  /**
   * True when a round was interrupted by a restart. Shown as 재개 필요 rather
   * than as an idle room: a state that will not clear on its own has to be
   * visible, the same reason 조율 중 is.
   */
  needsResume: boolean;
}
